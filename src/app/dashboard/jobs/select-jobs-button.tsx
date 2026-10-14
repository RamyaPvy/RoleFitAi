"use client";

const MAX_BATCH = 30;

// Ticks the first 30 jobs on this page that are not already tailored.
export function SelectJobsButton() {
  return (
    <button
      className="button button-secondary"
      type="button"
      onClick={() => {
        const boxes = document.querySelectorAll<HTMLInputElement>('input[name="jobIds"]');
        boxes.forEach((box, index) => {
          box.checked = index < MAX_BATCH;
        });
      }}
    >
      Select first 30
    </button>
  );
}
