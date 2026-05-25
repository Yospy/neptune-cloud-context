import type { UploadReceipt, UploadReceiptResponse } from "neptune-context-shared";

function unwrapReceipt(input: UploadReceipt | UploadReceiptResponse) {
  return "receipt" in input ? input.receipt : input;
}

export function formatUploadReceipt(input: UploadReceipt | UploadReceiptResponse) {
  const receipt = unwrapReceipt(input);
  const changed = "changed" in input ? input.changed : true;
  const heading = changed ? "Context uploaded" : "No change detected.";

  return [
    heading,
    "",
    `ID: ${receipt.context_id}`,
    `Org: ${receipt.org}`,
    `Project: ${receipt.project}`,
    `Title: ${receipt.title}`,
    `From: ${receipt.source_workstream}`,
    `To: ${receipt.target_workstreams.join(", ")}`,
    `Domain: ${receipt.domain}`,
    `Code areas: ${receipt.code_areas.join(", ")}`,
    `Type: ${receipt.context_type}`,
    `Status: ${receipt.status}`,
    `Version: ${receipt.version}`,
    `Created at: ${receipt.created_at}`,
    `Hash: ${receipt.content_hash}`
  ].join("\n");
}
