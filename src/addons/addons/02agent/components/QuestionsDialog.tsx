import * as React from "react";
import chat from "../ui/Chat.module.less";
import { AskUserAnswered, AskUserQuestion, AskUserRequest } from "../agentStores";

interface QuestionsDialogProps {
    request: AskUserRequest | null;
    onResolve: (answers: AskUserAnswered[]) => void;
}

const isChoice = (question: AskUserQuestion) =>
    question.questionType === "choice" ||
    (!question.questionType && Array.isArray(question.options) && question.options.length >= 2);

const isMultiChoice = (question: AskUserQuestion) => question.questionType === "multiChoice";

/**
 * Clarification dialog for the askUser tool. Renders each question as either a choice
 * list or a text field. "跳过" leaves the answer empty so the model knows which
 * questions the user chose not to answer.
 */
export const QuestionsDialog: React.FC<QuestionsDialogProps> = ({ request, onResolve }) => {
    const [answers, setAnswers] = React.useState<Record<string, string>>({});

    React.useEffect(() => {
        setAnswers({});
    }, [request]);

    if (!request || request.questions.length === 0) return null;

    const setValue = (id: string, value: string) => setAnswers((previous) => ({ ...previous, [id]: value }));

    const submit = () => {
        onResolve(
            request.questions.map((question) => ({
                id: question.id,
                question: question.question,
                answer: (answers[question.id] || "").split("|").filter(Boolean).join("；"),
            })),
        );
    };

    return (
        <div className={chat.approvalOverlay} role="dialog" aria-modal="true">
            <div className={chat.approvalPanel}>
                <div className={chat.approvalHeader}>
                    <div>
                        <div className={chat.approvalTitle}>AI 需要补充信息</div>
                        <div className={chat.approvalSubtitle}>
                            {request.context?.trim() ? request.context.trim() : "回答以下问题后，AI 会继续任务。"}
                        </div>
                    </div>
                </div>
                <div className={chat.questionsList}>
                    {request.questions.map((question) => (
                        <label key={question.id} className={chat.questionItem}>
                            <span className={chat.questionText}>{question.question}</span>
                            {(isChoice(question) || isMultiChoice(question)) && question.options?.length ? (
                                <span className={chat.questionOptions}>
                                    {question.options.map((option) =>
                                        isMultiChoice(question) ? (
                                            <label key={option} className={chat.questionOption}>
                                                <input
                                                    type="checkbox"
                                                    checked={(answers[question.id] || "").split("|").includes(option)}
                                                    onChange={(event) => {
                                                        const current = answers[question.id]
                                                            ? answers[question.id].split("|").filter(Boolean)
                                                            : [];
                                                        const next = event.target.checked
                                                            ? [...current, option]
                                                            : current.filter((value) => value !== option);
                                                        setValue(question.id, next.join("|"));
                                                    }}
                                                />
                                                <span>{option}</span>
                                            </label>
                                        ) : (
                                            <label key={option} className={chat.questionOption}>
                                                <input
                                                    type="radio"
                                                    name={`q-${question.id}`}
                                                    checked={answers[question.id] === option}
                                                    onChange={() => setValue(question.id, option)}
                                                />
                                                <span>{option}</span>
                                            </label>
                                        ),
                                    )}
                                </span>
                            ) : (
                                <input
                                    className={chat.questionInput}
                                    type="text"
                                    value={answers[question.id] || ""}
                                    onChange={(event) => setValue(question.id, event.target.value)}
                                    placeholder="输入你的回答（可留空跳过）"
                                    autoFocus
                                />
                            )}
                        </label>
                    ))}
                </div>
                <div className={chat.approvalActions}>
                    <button type="button" className={chat.approvalDeny} onClick={submit}>
                        提交回答
                    </button>
                </div>
            </div>
        </div>
    );
};
