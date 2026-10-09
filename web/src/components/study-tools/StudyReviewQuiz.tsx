"use client";
import { useState } from "react";
import type { StudyReviewQuestion } from "@shared/index";
import styles from "./studyTools.module.css";
export function StudyReviewQuiz({ questions }: { questions: StudyReviewQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const answered = questions.filter(question => answers[question.id] !== undefined);
  return <div className={styles.reviewQuiz}>
    {questions.map((question, index) => <fieldset key={question.id} className={styles.reviewQuestion}>
      <legend>{index + 1}. {question.prompt}</legend>
      {question.options.map((option, optionIndex) => <button type="button" key={optionIndex} disabled={answers[question.id] !== undefined} data-correct={answers[question.id] === undefined ? undefined : optionIndex === question.correctIndex} aria-pressed={answers[question.id] === optionIndex} onClick={() => setAnswers(previous => ({ ...previous, [question.id]: optionIndex }))}>{option}</button>)}
      {answers[question.id] !== undefined ? <p role="status" className={styles.quizFeedback}>{answers[question.id] === question.correctIndex ? "إجابة صحيحة." : `الإجابة الصحيحة: ${question.options[question.correctIndex]}`}<br />{question.explanation}</p> : null}
    </fieldset>)}
    {answered.length === questions.length ? <p className={styles.quizFeedback} role="status">نتيجة المراجعة: {answered.filter(question => answers[question.id] === question.correctIndex).length} من {questions.length}</p> : null}
  </div>;
}
