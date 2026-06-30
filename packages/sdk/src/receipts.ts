import type { UploadReceipt, UploadReceiptResponse } from "neptune-context-shared";

function unwrapReceipt(input: UploadReceipt | UploadReceiptResponse) {
  return "receipt" in input ? input.receipt : input;
}

function userLabel(user: UploadReceipt["created_by_user"]) {
  return user.email ?? user.display_name ?? user.id;
}

export function formatUploadReceipt(input: UploadReceipt | UploadReceiptResponse) {
  const receipt = unwrapReceipt(input);
  const changed = "changed" in input ? input.changed : true;
  const heading = changed ? "Context uploaded" : "No change detected.";
  const authorNoteLines = receipt.author_note_md
    ? [
        `Author note source: ${receipt.author_note_source}`,
        `Author note updated at: ${receipt.author_note_updated_at}`,
        `Author note: ${receipt.author_note_md}`
      ]
    : [];

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
    `Published by: ${userLabel(receipt.created_by_user)}`,
    `Updated by: ${userLabel(receipt.updated_by_user)}`,
    ...authorNoteLines,
    `Hash: ${receipt.content_hash}`
  ].join("\n");
}
