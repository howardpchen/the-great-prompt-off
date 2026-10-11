export type EvaluationFailureCode = "output_format" | "evaluation_failed";

export const outputFormatHint = "The model's response did not match the required JSON format. Check your prompt for conflicting JSON or output-format instructions; the app supplies the required format automatically. If this continues, contact the organizer.";

/** Only known codes select participant-facing text; never display provider payloads. */
export function evaluationFailureMessage(code: unknown, context: "public" | "final" | "sandbox") {
  const explanation = code === "output_format" ? outputFormatHint : "Evaluation could not finish after automatic recovery. Please try again later or contact the organizer.";
  const outcome = context === "public" ? "No test attempt was used." : context === "final" ? "No final submission was used." : "This sample was not scored.";
  return `${explanation} ${outcome}`;
}
