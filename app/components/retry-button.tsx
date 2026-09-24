"use client";
export default function RetryButton() {
  return (
    <button className="black-button" onClick={() => window.location.reload()}>
      Try again →
    </button>
  );
}
