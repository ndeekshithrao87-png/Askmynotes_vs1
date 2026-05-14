const pdfInput = document.querySelector("#pdf-input");
const uploadStatus = document.querySelector("#upload-status");
const askBtn = document.querySelector("#ask-btn");
const status = document.querySelector("#status");
const answerText = document.querySelector("#answer-text");

let uploadedFile = null;

// When user picks a PDF
pdfInput.addEventListener("change", function () {
  const file = pdfInput.files[0];
  if (!file) return;
  uploadedFile = file;
  uploadStatus.textContent = "✓ " + file.name + " ready";
  uploadStatus.style.color = "green";
});

// When user clicks Submit
askBtn.addEventListener("click", async function () {
  const question = document.querySelector("#question").value.trim();

  // Basic checks
  if (!uploadedFile) {
    alert("Please upload a PDF first!");
    return;
  }
  if (!question) {
    alert("Please type a question!");
    return;
  }

  // Show loading state
  askBtn.disabled = true;
  askBtn.textContent = "Thinking...";
  status.textContent = "Getting your answer...";
  status.style.color = "#2563eb";
  answerText.textContent = "Please wait...";

  // Send to backend
  const formData = new FormData();
  formData.append("file", uploadedFile);
  formData.append("question", question);

  try {
    const response = await fetch("http://localhost:3000/ask", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    // Show answer
    answerText.textContent = data.answer;
    answerText.style.fontStyle = "normal";
    answerText.style.color = "#0f172a";
    status.textContent = "Done!";
    status.style.color = "green";

  } catch (error) {
    answerText.textContent = "Something went wrong. Is the backend running?";
    answerText.style.color = "red";
    status.textContent = "";
  }

  // Reset button
  askBtn.disabled = false;
  askBtn.textContent = "Submit";
});