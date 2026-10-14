"use client";

const MAX_BATCH = 30;
const MIN_FIT = 50;

// Ticks up to 30 untailored jobs on this page that fit the resume (50%+), skipping poor fits.
export function SelectJobsButton() {
  return (
    <button
      className="button button-secondary"
      type="button"
      onClick={() => {
        const boxes = document.querySelectorAll<HTMLInputElement>('input[name="jobIds"]');
        let picked = 0;
        for (const box of boxes) {
          const fit = box.dataset.fit;
          const good = fit === undefined || fit === "" || Number(fit) >= MIN_FIT;
          box.checked = good && picked < MAX_BATCH;
          if (box.checked) picked += 1;
        }
      }}
    >
      Select good fits (50%+)
    </button>
  );
}
