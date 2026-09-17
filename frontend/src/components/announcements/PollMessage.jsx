import { useState, useEffect, useMemo } from "react";
import api from "../../api/axios";
import BarChart2 from "lucide-react/dist/esm/icons/bar-chart-2";
import Check from "lucide-react/dist/esm/icons/check";
import {
  getPollQuestions,
  hasSubmitted,
  isPollExpired,
} from "../../utils/pollHelpers";

const PollMessage = ({ msg, isOwn, onVoted }) => {
  const [answers, setAnswers] = useState({});
  const [voting, setVoting] = useState(false);
  const [localMsg, setLocalMsg] = useState(msg);

  useEffect(() => {
    setLocalMsg(msg);
  }, [msg]);

  const poll = localMsg.poll;
  const questions = useMemo(() => getPollQuestions(poll), [poll]);
  const submitted = hasSubmitted(localMsg);
  const showResults = submitted || poll?.isClosed || isPollExpired(poll);
  const totalVotes = poll?.totalVotes || 0;
  const isMulti = questions.length > 1 || (poll?.questions?.length > 0);

  useEffect(() => {
    if (!submitted) return;
    const initial = {};
    if (localMsg.userAnswers?.length) {
      for (const a of localMsg.userAnswers) {
        if (a.text != null) {
          initial[a.questionIndex] = { text: a.text };
        } else {
          initial[a.questionIndex] = { optionIndices: a.optionIndices || [] };
        }
      }
    } else if (localMsg.userVote?.length) {
      initial[0] = { optionIndices: localMsg.userVote };
    }
    setAnswers(initial);
  }, [submitted, localMsg.userAnswers, localMsg.userVote]);

  const toggleOption = (qIdx, optIdx) => {
    if (showResults || voting) return;
    const q = questions[qIdx];
    setAnswers((prev) => {
      const current = prev[qIdx]?.optionIndices || [];
      let next;
      if (q.allowMultiple) {
        next = current.includes(optIdx)
          ? current.filter((i) => i !== optIdx)
          : [...current, optIdx];
      } else {
        next = [optIdx];
      }
      return { ...prev, [qIdx]: { optionIndices: next } };
    });
  };

  const setTextAnswer = (qIdx, text) => {
    if (showResults || voting) return;
    setAnswers((prev) => ({ ...prev, [qIdx]: { text } }));
  };

  const allAnswered = questions.every((q, idx) => {
    const a = answers[idx];
    if (!a) return false;
    if (q.type === "text") return Boolean(a.text?.trim());
    return Array.isArray(a.optionIndices) && a.optionIndices.length > 0;
  });

  const submitVote = async () => {
    if (!allAnswered || voting) return;
    try {
      setVoting(true);
      const payload = isMulti
        ? {
            answers: questions.map((q, idx) => {
              const a = answers[idx];
              if (q.type === "text") {
                return { questionIndex: idx, text: a.text.trim() };
              }
              return { questionIndex: idx, optionIndices: a.optionIndices };
            }),
          }
        : { optionIndices: answers[0]?.optionIndices || [] };

      const { data } = await api.post(`/announcements/${localMsg._id}/vote`, payload);
      const updated = {
        ...localMsg,
        ...(data.announcement || {}),
        userVote: data.userVote ?? data.announcement?.userVote,
        userAnswers: data.userAnswers ?? data.announcement?.userAnswers,
      };
      setLocalMsg(updated);
      onVoted?.(updated);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to submit");
    } finally {
      setVoting(false);
    }
  };

  const getPct = (voteCount) => {
    if (!totalVotes) return 0;
    return Math.round((voteCount / totalVotes) * 100);
  };

  const getUserSelections = (qIdx) => {
    if (localMsg.userAnswers?.length) {
      const a = localMsg.userAnswers.find((x) => x.questionIndex === qIdx);
      return a?.optionIndices || [];
    }
    if (qIdx === 0 && localMsg.userVote) return localMsg.userVote;
    return answers[qIdx]?.optionIndices || [];
  };

  const getUserText = (qIdx) => {
    if (localMsg.userAnswers?.length) {
      const a = localMsg.userAnswers.find((x) => x.questionIndex === qIdx);
      return a?.text || "";
    }
    return answers[qIdx]?.text || "";
  };

  return (
    <div className={`announcement-poll-card ${isOwn ? "own" : ""}`}>
      <div className="announcement-poll-badge">
        <BarChart2 size={10} /> {isMulti ? "Survey" : "Poll"}
      </div>

      {isMulti && poll?.title && (
        <div className="announcement-poll-title">{poll.title}</div>
      )}

      {questions.map((q, qIdx) => {
        const userSelections = getUserSelections(qIdx);
        const userText = getUserText(qIdx);

        return (
          <div key={qIdx} className="announcement-poll-question-block">
            {questions.length > 1 && (
              <div className="announcement-poll-question-num">Q{qIdx + 1}</div>
            )}
            <div className="announcement-poll-question">
              {q.text || (qIdx === 0 ? localMsg.message : "")}
            </div>

            {q.type === "text" ? (
              showResults ? (
                <div className="announcement-poll-text-answer">
                  {userText || <em>No answer</em>}
                </div>
              ) : (
                <textarea
                  className="announcement-poll-textarea"
                  value={answers[qIdx]?.text || ""}
                  onChange={(e) => setTextAnswer(qIdx, e.target.value)}
                  placeholder="Type your answer…"
                  maxLength={2000}
                  rows={3}
                  disabled={voting}
                />
              )
            ) : (
              q.options?.map((opt, idx) => {
                const isSelected =
                  (answers[qIdx]?.optionIndices || []).includes(idx) ||
                  userSelections.includes(idx);
                const pct = getPct(opt.voteCount || 0);

                return (
                  <button
                    key={idx}
                    type="button"
                    className={`announcement-poll-option${isSelected ? " selected" : ""}`}
                    onClick={() => toggleOption(qIdx, idx)}
                    disabled={showResults || voting}
                  >
                    {showResults && (
                      <span
                        className="announcement-poll-option-bar"
                        style={{ width: `${pct}%` }}
                      />
                    )}
                    <span className="announcement-poll-option-content">
                      <span className="announcement-poll-option-text">
                        {showResults && userSelections.includes(idx) && (
                          <Check size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                        )}
                        {opt.text}
                      </span>
                      {showResults && (
                        <span className="announcement-poll-option-pct">{pct}%</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}

            {q.type === "multiple_choice" && q.allowMultiple && !showResults && (
              <div className="announcement-poll-hint">Select all that apply</div>
            )}
          </div>
        );
      })}

      {!showResults && (
        <button
          type="button"
          className="announcement-poll-submit"
          disabled={!allAnswered || voting}
          onClick={submitVote}
        >
          {voting ? "Submitting…" : isMulti ? "Submit survey" : "Submit vote"}
        </button>
      )}

      <div className="announcement-poll-meta">
        {totalVotes} submission{totalVotes !== 1 ? "s" : ""}
        {isMulti && ` · ${questions.length} questions`}
      </div>

      {(poll?.isClosed || isPollExpired(poll)) && (
        <div className="announcement-poll-closed">Poll closed</div>
      )}
    </div>
  );
};

export default PollMessage;
