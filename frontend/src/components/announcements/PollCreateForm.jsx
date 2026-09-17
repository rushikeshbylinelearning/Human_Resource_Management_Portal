import { useRef, useState } from "react";
import FileUp from "lucide-react/dist/esm/icons/file-up";
import Plus from "lucide-react/dist/esm/icons/plus";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import api from "../../api/axios";
import { parseQuestionsFromPdf } from "../../utils/pdfPollParser";
import {
  MIN_OPTIONS,
  MAX_OPTIONS,
  createEmptyQuestion,
} from "../../utils/pollHelpers";
import PollCloseDateTime from "./PollCloseDateTime";

const PollCreateForm = ({ onCreated }) => {
  const fileInputRef = useRef(null);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([createEmptyQuestion()]);
  const [closesAt, setClosesAt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [pdfName, setPdfName] = useState("");

  const updateQuestion = (qIdx, patch) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, ...patch } : q))
    );
  };

  const updateOption = (qIdx, optIdx, value) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const options = q.options.map((o, j) => (j === optIdx ? value : o));
        return { ...q, options };
      })
    );
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, createEmptyQuestion()]);
  };

  const removeQuestion = (qIdx) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== qIdx));
  };

  const addOption = (qIdx) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx || q.options.length >= MAX_OPTIONS) return q;
        return { ...q, options: [...q.options, ""] };
      })
    );
  };

  const removeOption = (qIdx, optIdx) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx || q.options.length <= MIN_OPTIONS) return q;
        return { ...q, options: q.options.filter((_, j) => j !== optIdx) };
      })
    );
  };

  const handleTypeChange = (qIdx, type) => {
    updateQuestion(qIdx, {
      type,
      options: type === "multiple_choice" ? ["", ""] : [],
      allowMultiple: false,
    });
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file");
      return;
    }

    try {
      setParsing(true);
      setPdfName(file.name);
      const parsed = await parseQuestionsFromPdf(file);
      if (!parsed.length) {
        alert(
          "Could not detect questions in this PDF. Use numbered questions (1. …) with options (a), b) … or indented lines below each question)."
        );
        return;
      }
      setQuestions(parsed);
      if (!title.trim() && parsed.length > 1) {
        setTitle(file.name.replace(/\.pdf$/i, ""));
      }
    } catch (error) {
      console.error("PDF parse error:", error);
      alert("Failed to read PDF. Please try again or add questions manually.");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearPdfSession = () => {
    setPdfName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    const builtQuestions = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const text = q.text.trim();
      if (!text) {
        alert(`Question ${i + 1} text is required`);
        return;
      }

      if (q.type === "text") {
        builtQuestions.push({ text, type: "text" });
      } else {
        const opts = q.options.map((o) => o.trim()).filter(Boolean);
        if (opts.length < MIN_OPTIONS) {
          alert(`Question ${i + 1} needs at least ${MIN_OPTIONS} options`);
          return;
        }
        builtQuestions.push({
          text,
          type: "multiple_choice",
          options: opts.map((t) => ({ text: t })),
          allowMultiple: Boolean(q.allowMultiple),
        });
      }
    }

    try {
      setSubmitting(true);
      const summary =
        trimmedTitle ||
        (builtQuestions.length === 1 ? builtQuestions[0].text : "Team survey");

      const { data } = await api.post("/announcements", {
        contentType: "poll",
        message: summary,
        poll: {
          title: trimmedTitle || null,
          questions: builtQuestions,
          closesAt: closesAt ? closesAt.toISOString() : null,
        },
      });

      setTitle("");
      setQuestions([createEmptyQuestion()]);
      setClosesAt(null);
      clearPdfSession();
      onCreated?.(data);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to create poll");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="poll-create-form" onSubmit={handleSubmit}>
      <h3>Create a poll</h3>
      <p className="poll-create-desc">
        Build a multi-question survey or import from PDF (parsed in your browser only).
        Best results: numbered questions with options as a), b), bullets, or indented lines
        under each question. Titles and instructions are filtered out automatically.
      </p>

      <div className="poll-create-pdf-zone">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handlePdfUpload}
          hidden
          id="poll-pdf-upload"
        />
        <label htmlFor="poll-pdf-upload" className="poll-create-pdf-btn">
          <FileUp size={16} />
          {parsing ? "Reading PDF…" : "Import questions from PDF"}
        </label>
        {pdfName && (
          <span className="poll-create-pdf-name">
            {pdfName}
            <button type="button" onClick={clearPdfSession} aria-label="Clear PDF">
              ×
            </button>
          </span>
        )}
      </div>

      <div className="poll-create-field">
        <label htmlFor="poll-title">Survey title (optional)</label>
        <input
          id="poll-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Q2 Employee Feedback"
          maxLength={200}
        />
      </div>

      <div className="poll-create-questions">
        {questions.map((q, qIdx) => (
          <div key={qIdx} className="poll-create-question-card">
            <div className="poll-create-question-head">
              <span className="poll-create-question-num">Question {qIdx + 1}</span>
              <div className="poll-create-type-toggle">
                <button
                  type="button"
                  className={q.type === "multiple_choice" ? "active" : ""}
                  onClick={() => handleTypeChange(qIdx, "multiple_choice")}
                >
                  Multiple choice
                </button>
                <button
                  type="button"
                  className={q.type === "text" ? "active" : ""}
                  onClick={() => handleTypeChange(qIdx, "text")}
                >
                  Text answer
                </button>
              </div>
              {questions.length > 1 && (
                <button
                  type="button"
                  className="poll-create-remove-btn"
                  onClick={() => removeQuestion(qIdx)}
                  aria-label="Remove question"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <textarea
              value={q.text}
              onChange={(e) => updateQuestion(qIdx, { text: e.target.value })}
              placeholder="What would you like to ask?"
              maxLength={500}
              required
            />

            {q.type === "multiple_choice" && (
              <div className="poll-create-options-block">
                <label>Options</label>
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="poll-create-option-row">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                      placeholder={`Option ${optIdx + 1}`}
                      maxLength={200}
                    />
                    {q.options.length > MIN_OPTIONS && (
                      <button
                        type="button"
                        className="poll-create-remove-btn"
                        onClick={() => removeOption(qIdx, optIdx)}
                        aria-label="Remove option"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {q.options.length < MAX_OPTIONS && (
                  <button
                    type="button"
                    className="poll-create-add-btn"
                    onClick={() => addOption(qIdx)}
                  >
                    + Add option
                  </button>
                )}
                <label className="poll-create-checkbox">
                  <input
                    type="checkbox"
                    checked={q.allowMultiple}
                    onChange={(e) =>
                      updateQuestion(qIdx, { allowMultiple: e.target.checked })
                    }
                  />
                  Allow multiple selections
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" className="poll-create-add-question" onClick={addQuestion}>
        <Plus size={14} /> Add question
      </button>

      <PollCloseDateTime value={closesAt} onChange={setClosesAt} />

      <button type="submit" className="poll-create-submit" disabled={submitting || parsing}>
        {submitting ? "Publishing…" : `Publish poll (${questions.length} question${questions.length !== 1 ? "s" : ""})`}
      </button>
    </form>
  );
};

export default PollCreateForm;
