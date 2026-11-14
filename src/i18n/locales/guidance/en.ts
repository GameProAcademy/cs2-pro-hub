import type { guidancePtBR } from "./pt-BR";

export const guidanceEn: Record<keyof typeof guidancePtBR, string> = {
  "guidance.whatToDo": "What should you do?",
  "guidance.reference": "Technical reference",
  "guidance.action.retry": "Try again",
  "guidance.action.chooseAnother": "Upload another demo",
  "guidance.action.selectPlayer": "Select my player",
  "guidance.action.report": "Report a problem",
  "guidance.action.understood": "Got it",

  "guidance.processing.title": "Analysis in progress",
  "guidance.processing.body": "Your demo is queued or being processed normally.",
  "guidance.processing.todo":
    "You do not need to upload it again. Follow the status here; the analysis continues on the server.",
  "guidance.completed.title": "Analysis complete",
  "guidance.completed.body": "Your match was processed and linked to your profile.",
  "guidance.completed.todo": "Nothing to do. Your data already shows in your analyses.",
  "guidance.partial.title": "Analysis complete with limitations",
  "guidance.partial.body":
    "Your match was processed, but some data was not available in this demo. We only show what was actually measured.",
  "guidance.partial.todo": "Nothing to do. Unavailable metrics stay blank, never zero.",
  "guidance.identity_pending.title": "Waiting for identification",
  "guidance.identity_pending.body":
    "Your match was read. We need to confirm which player is you before finishing your statistics.",
  "guidance.identity_pending.todo": "Select your nickname to continue the analysis.",
  "guidance.invalid_file.title": "We could not read your demo",
  "guidance.invalid_file.body":
    "We could not read this demo. The file may be incomplete or damaged.",
  "guidance.invalid_file.todo": "Choose another demo and try again.",
  "guidance.incompatible_format.title": "Incompatible format",
  "guidance.incompatible_format.body":
    "This file is not in a format or size compatible with CS2 PRO.",
  "guidance.incompatible_format.todo": "Select a valid CS2 demo in .dem format.",
  "guidance.insufficient_sample.title": "Match too short",
  "guidance.insufficient_sample.body":
    "The demo is valid but has too few usable rounds for an honest analysis.",
  "guidance.insufficient_sample.todo":
    "Upload another demo from a longer match. Uploading this same demo again will give the same result.",
  "guidance.match_not_finished.title": "No confirmed official end",
  "guidance.match_not_finished.body":
    "The demo does not show the official end of the match: it may have been interrupted before the end, recorded only in part, or end in the middle of a round.",
  "guidance.match_not_finished.todo":
    "Upload the demo of an officially finished match (win or surrender). Uploading this same demo again will give the same result.",
  "guidance.match_insufficient_rounds.title": "Fewer than 9 valid rounds",
  "guidance.match_insufficient_rounds.body":
    "The match ended officially but has fewer than 9 valid rounds played, the minimum for a reliable analysis. Rounds that were never played are never invented.",
  "guidance.match_insufficient_rounds.todo":
    "Upload the demo of a match with at least 9 rounds played. Uploading this same demo again will give the same result.",
  "guidance.match_player_coverage.title": "Not enough player data",
  "guidance.match_player_coverage.body":
    "The demo does not identify the participants reliably enough to attribute the statistics to each player.",
  "guidance.match_player_coverage.todo":
    "Upload another demo of the match, if there is one. Uploading this same demo again will give the same result.",
  "guidance.temporary_failure.title": "A temporary failure occurred",
  "guidance.temporary_failure.body":
    "Our system hit a temporary failure during the analysis. Your demo is still recorded in the history.",
  "guidance.temporary_failure.todo":
    "You do not need to upload the demo again. Try again; if the problem persists, report it to our team.",
  "guidance.service_issue.title": "A failure on our side",
  "guidance.service_issue.body":
    "The analysis stopped because of a problem in our analysis service, not in your file.",
  "guidance.service_issue.todo":
    "Do not upload this same demo again for now. Report the problem so our team can investigate.",
  "guidance.raw_audit_review.title": "Analysis held for review",
  "guidance.raw_audit_review.body":
    "We received your demo, but some data did not pass the security and integrity checks. For safety, we did not generate statistics for this match.",
  "guidance.raw_audit_review.todo":
    "You do not need to upload this same demo again. Our team needs to review the problem.",
  "guidance.canonical_review.title": "Data validation not completed",
  "guidance.canonical_review.body":
    "We could not validate the data needed to generate this match's statistics. Your raw data was preserved.",
  "guidance.canonical_review.todo":
    "Our team needs to check the cause before the analysis can finish. Do not upload this same demo again.",
  "guidance.quarantined.title": "Match under review",
  "guidance.quarantined.body":
    "This match is held under technical review and cannot be processed again for now.",
  "guidance.quarantined.todo": "Do not upload this same demo again. Report it if you need help.",
  "guidance.older_parser.title": "Analysed by an earlier version",
  "guidance.older_parser.body": "This demo was analysed by an earlier version of our analyser.",
  "guidance.older_parser.todo":
    "Use “Reprocess with the current parser” on this demo's card. You do not need to upload the file again.",
  "guidance.file_expired.title": "This demo's file has expired",
  "guidance.file_expired.body": "The stored file of this demo is no longer available.",
  "guidance.file_expired.todo": "Upload the file again to analyse it.",
  "guidance.cancelled.title": "Analysis cancelled",
  "guidance.cancelled.body": "The analysis of this demo was cancelled. The history was kept.",
  "guidance.cancelled.todo": "If you want it analysed, upload the demo again.",
  "guidance.internal_error.title": "An unexpected problem occurred",
  "guidance.internal_error.body": "An unexpected problem occurred during the analysis.",
  "guidance.internal_error.todo":
    "Our team can investigate it. Send a report to help us find the cause.",
  "guidance.unknown.title": "Unknown state",
  "guidance.unknown.body":
    "We received a state we do not recognise. Nothing was treated as complete.",
  "guidance.unknown.todo": "Follow this demo in the history or report the problem.",

  "report.detailsLabel": "Tell us more (optional)",
  "report.detailsPlaceholder": "What you were doing, what you expected to see…",
  "report.privacy": "Do not include passwords, tokens or personal data",
  "report.send": "Send report",
  "report.sending": "Sending…",
  "report.cancel": "Cancel",
  "report.sent":
    "Problem reported successfully. Our team received the information needed to investigate.",
  "report.recorded":
    "We could not send your report automatically. Your problem was recorded in our system and can be sent again.",
  "report.sendAgain": "Send again",
  "report.protocol": "Protocol",
  "report.rateLimited":
    "You sent several reports recently. Please wait a little before sending another one.",
  "report.notFound": "We could not find this demo in your account.",
  "report.unavailable": "We could not record your report right now. Please try again in a moment.",

  "pending.titleOne": "1 demo waiting for your identification",
  "pending.titleMany": "{count} demos waiting for your identification",
  "pending.body":
    "Your matches were read. Select your player to finish the statistics; nothing is lost meanwhile.",
  "pending.cta": "Identify now",
  "pending.navLabel": "{count} pending actions",
  "pending.unnamed": "Unnamed demo",
  "pending.more": "and {count} more",

  "adminEmail.title": "Support email (Hostinger)",
  "adminEmail.configured": "Configured",
  "adminEmail.sender": "Sender",
  "adminEmail.recipient": "Report recipient",
  "adminEmail.senderAuthorized": "Token authorizes the sender",
  "adminEmail.reason": "Reason",
  "adminEmail.testHint":
    "The test sends a single message to the support inbox (at most one every 10 minutes). Accepted by the API does not mean delivered: confirm receipt in the mailbox.",
  "adminEmail.sendTest": "Send test email",
  "adminEmail.recheck": "Check again",
  "adminEmail.accepted":
    "Accepted and sent by Hostinger. Confirm receipt in the destination mailbox.",
  "adminEmail.notSent": "Not sent",
  "adminEmail.yes": "yes",
  "adminEmail.no": "no",
};
