const express = require("express");
const path = require("path");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve the frontend files (index page is askmynotes.html)
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "askmynotes.html"));
});

const upload = multer({ storage: multer.memoryStorage() });

app.post("/ask", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a PDF file." });
    }

    let text = "";
    if (typeof pdfParse === "function") {
      const pdfData = await pdfParse(req.file.buffer);
      text = pdfData.text || "";
    } else if (pdfParse.default && typeof pdfParse.default === "function") {
      const pdfData = await pdfParse.default(req.file.buffer);
      text = pdfData.text || "";
    } else if (pdfParse.PDFParse) {
      const parser = new pdfParse.PDFParse({ data: req.file.buffer });
      const parsed = await parser.getText();
      text = parsed?.text || "";
    }

    text = text.trim();
    const question = req.body.question ? req.body.question.trim() : "";

    if (!question) {
      return res.status(400).json({ error: "Please provide a question." });
    }

    if (!text || text.length < 10) {
      return res.json({
        answer: "⚠️ This PDF appears to be a scanned image or photo without selectable text. Please upload a PDF with digital/typed text (such as lecture notes or textbooks)."
      });
    }

    // Helper: find the most relevant chunk of the document for a given question
    function findRelevantChunk(fullText, q) {
      const qWords = q.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);

      // Strategy 1: This PDF style has section headers like "CS305PC: DATABASE MANAGEMENT SYSTEM"
      // followed by the real syllabus. Find all such headers and pick the one matching the question.
      const headerRegex = /([A-Z]{2,4}\d{3}[A-Z]{2,3})\s*:\s*([A-Z][A-Z\s&,\-]{5,80})/g;
      const headers = [];
      let m;
      while ((m = headerRegex.exec(fullText)) !== null) {
        headers.push({ index: m.index, code: m[1], title: m[2].trim() });
      }

      if (headers.length > 0) {
        let bestHeader = null;
        let bestScore = 0;
        for (const h of headers) {
          const titleLower = h.title.toLowerCase();
          let score = 0;
          for (const w of qWords) {
            if (titleLower.includes(w)) score += 2;
          }
          if (score > bestScore) {
            bestScore = score;
            bestHeader = h;
          }
        }

        if (bestHeader && bestScore > 0) {
          const startIdx = bestHeader.index;
          // Find the next header after this one, to know where this subject's section ends
          const nextHeader = headers.find(h => h.index > startIdx);
          const endIdx = nextHeader ? nextHeader.index : Math.min(fullText.length, startIdx + 4000);
          return fullText.slice(startIdx, endIdx);
        }
      }

      // Strategy 2 (fallback): keyword-density search over sentence windows,
      // used if the document doesn't match the header pattern above.
      const sentences = fullText.split(/(?<=[.?!\n])\s+/).filter(s => s.trim().length > 15);
      let bestIndex = 0;
      let maxScore = 0;
      const windowSize = 12;

      for (let i = 0; i < sentences.length; i += 4) {
        const chunk = sentences.slice(i, i + windowSize).join(" ");
        const chunkLower = chunk.toLowerCase();
        let score = 0;
        for (const w of qWords) {
          if (chunkLower.includes(w)) score += 1;
        }
        if (score > maxScore) {
          maxScore = score;
          bestIndex = i;
        }
      }

      const start = Math.max(0, bestIndex - 5);
      const end = Math.min(sentences.length, bestIndex + windowSize + 30);
      return sentences.slice(start, end).join(" ");
    }

    // 1. If Gemini API Key is provided, use it (free tier), with auto-retry on temporary overload (503)
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

      // Retrieve the most relevant chunk instead of dumping the whole document —
      // large PDFs can bury the answer where the model misses it.
      const relevantChunk = findRelevantChunk(text, question);
      const contextText = relevantChunk.length > 200 ? relevantChunk : text;

      const prompt = `You are answering questions using the notes below. First, try to answer using ONLY the notes — give a direct, clear answer grounded in them.

If the answer is genuinely not covered in these notes, you may answer from your own general knowledge instead, but you MUST start that answer with exactly this phrase: "This isn't covered in your notes, but generally: " — do not skip this label under any circumstance when using outside knowledge.

NOTES:
${contextText}

QUESTION: ${question}

ANSWER:`;

      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await model.generateContent(prompt);
          const answer = result.response.text();

          if (answer) {
            return res.json({ answer });
          }
          break; // empty answer, no point retrying — fall through to local search
        } catch (aiErr) {
          const isOverloaded = aiErr.message.includes("503") || aiErr.message.includes("overloaded") || aiErr.message.includes("high demand");
          if (isOverloaded && attempt < maxRetries) {
            console.warn(`Gemini overloaded (attempt ${attempt}/${maxRetries}), retrying in ${attempt * 2}s...`);
            await new Promise(r => setTimeout(r, attempt * 2000));
            continue;
          }
          console.warn("Gemini API call failed, falling back to local text search:", aiErr.message);
          break;
        }
      }
    }

    // 2. Intelligent local extraction fallback (answers directly from PDF text if API fails or no key set)
    const sentences = text.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 25);
    const qWords = question.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);

    let bestSentences = [];
    let maxScore = 0;

    for (let i = 0; i < sentences.length; i++) {
      const chunk = sentences.slice(i, i + 3).join(" ");
      const chunkLower = chunk.toLowerCase();
      let score = 0;
      for (const w of qWords) {
        if (chunkLower.includes(w)) score += 2;
      }
      if (score > maxScore) {
        maxScore = score;
        bestSentences = [chunk];
      }
    }

    if (maxScore > 0 && bestSentences.length > 0) {
      return res.json({
        answer: `According to your notes:\n\n"${bestSentences[0].trim()}"`
      });
    }

    const preview = text.slice(0, 500).trim();
    return res.json({
      answer: `From your notes:\n\n"${preview}..."`
    });

  } catch (err) {
    console.error("Error processing PDF:", err);
    res.status(500).json({ error: err.message || "Failed to process the PDF." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));