import type { demoFlowPtBR } from "./pt-BR";

export const demoFlowEn: Record<keyof typeof demoFlowPtBR, string> = {
  "demoFlow.dialogLabel": "Your demo analysis",
  "demoFlow.file": "File",
  "demoFlow.size": "Size",
  "demoFlow.steps.label": "Analysis steps",
  "demoFlow.step.upload": "Upload",
  "demoFlow.step.validate": "Validation",
  "demoFlow.step.read": "Reading the match",
  "demoFlow.step.metrics": "Metrics",
  "demoFlow.step.identify": "Identification",
  "demoFlow.step.done": "Completion",
  "demoFlow.state.done": "done",
  "demoFlow.state.active": "in progress",
  "demoFlow.state.pending": "waiting",
  "demoFlow.state.error": "failed",

  "demoFlow.upload.title": "Uploading your demo",
  "demoFlow.upload.body": "We are securely sending your match to start the analysis.",
  "demoFlow.upload.hashing": "Preparing the file (checking its content)…",
  "demoFlow.upload.registering": "Registering the upload…",
  "demoFlow.upload.uploading": "Uploading the file…",
  "demoFlow.upload.keepOpen":
    "Keep this page open until the upload finishes. After that, the analysis continues on the server.",
  "demoFlow.upload.failedTitle": "We could not upload the demo",
  "demoFlow.upload.tryAgain": "Choose the file again",
  "demoFlow.upload.interruptedTitle": "The upload was interrupted",
  "demoFlow.upload.interruptedBody":
    "The page was closed or reloaded while {file} was uploading, and the browser does not keep the file. No analysis was started for this upload. Choose the same file again to upload it.",

  "demoFlow.validate.title": "Validating your demo",
  "demoFlow.validate.body": "We are checking the file and preparing your match for processing.",
  "demoFlow.validate.waitingJob": "Confirming that the demo was received…",
  "demoFlow.validate.queued": "Your demo is in the processing queue.",
  "demoFlow.validate.validating": "Validating the demo file.",

  "demoFlow.read.title": "Reading your match",
  "demoFlow.read.body": "We are analysing rounds, players, events and match information.",

  "demoFlow.metrics.title": "Calculating your metrics",
  "demoFlow.metrics.body":
    "We are organising the match data and preparing your performance profile.",
  "demoFlow.attaching.title": "Linking the match to your player",
  "demoFlow.attaching.body":
    "Your player is confirmed. We are linking this match and its metrics to your profile.",

  "demoFlow.identify.title": "Identifying your player",
  "demoFlow.identify.body": "We are identifying your profile in this match.",
  "demoFlow.identify.loadError": "We could not load the players of this match.",
  "demoFlow.identify.reload": "Try loading again",
  "demoFlow.identify.automaticTitle": "We found you in this match",
  "demoFlow.identify.automaticBody":
    "We identified your player through your linked Steam account. Confirm to finish the analysis.",
  "demoFlow.identify.confirmAutomatic": "Yes, that's me",
  "demoFlow.select.title": "What is your nickname in this match?",
  "demoFlow.select.body":
    "We found several players or could not automatically confirm which one is you. Select your nickname so we can correctly link your statistics to your profile.",
  "demoFlow.select.cta": "Confirm my player",
  "demoFlow.select.required": "Select a player to continue.",
  "demoFlow.select.suggested": "Nickname from your history",
  "demoFlow.select.team": "Team",
  "demoFlow.select.later": "Decide later (available in the history)",

  "demoFlow.done.title": "Analysis complete!",
  "demoFlow.done.body": "Your match was processed and your data is ready.",
  "demoFlow.done.player": "Player",
  "demoFlow.done.map": "Map",
  "demoFlow.done.status": "Status",
  "demoFlow.done.statusValue": "Processed and linked to your profile",
  "demoFlow.done.cta": "View my analysis",
  "demoFlow.done.close": "Close",
  "demoFlow.done.autoClose": "This window closes by itself in {seconds} s.",

  "demoFlow.failed.title": "The analysis did not finish",
  "demoFlow.failed.retryHint":
    "You can try again from this demo's card in the history, following the retry rules.",
  "demoFlow.failed.selectAndRetry":
    "The match was read, but the final step failed. Select your player to start a new attempt.",
  "demoFlow.cardAction.title": "This demo needs an action in the history",
  "demoFlow.cardAction.reprocess":
    "It was analysed by an earlier parser version. Use the card's button to reprocess it with the current parser.",
  "demoFlow.cardAction.reupload":
    "This demo's file has expired. Upload the file again to analyse it.",
  "demoFlow.blocked.title": "Review required",
  "demoFlow.cancelRequested.title": "Cancelling the analysis",
  "demoFlow.cancelled.title": "Analysis cancelled",
  "demoFlow.unknown.title": "Unknown state",
  "demoFlow.unknown.body":
    "We received a state we do not recognise. Nothing was treated as complete; follow this demo in the history.",

  "demoFlow.cancel": "Cancel analysis",
  "demoFlow.cancelConfirm": "Confirm cancellation",
  "demoFlow.cancelKeep": "Keep analysing",
  "demoFlow.cancelQuestion":
    "Cancelling stops the analysis of this demo. The history is kept. Do you want to cancel?",
  "demoFlow.cancelError": "We could not cancel right now. The analysis continues.",
  "demoFlow.background": "Continue in the background",
  "demoFlow.backgroundHint":
    "The analysis keeps running on the server; follow it on the card in the history.",
  "demoFlow.close": "Close",
  "demoFlow.reconnecting": "No connection. Trying to reconnect and resume tracking…",
  "demoFlow.resumed": "We resumed tracking this demo.",
  "demoFlow.leaveWarning": "The demo upload is still running. Leaving now stops the upload.",
};
