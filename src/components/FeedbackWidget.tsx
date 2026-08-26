'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import { submitFeedback, validateScreenshot, type FeedbackSeverity, type FeedbackType } from '@/lib/feedback';

export function FeedbackWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('bug');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<FeedbackSeverity | null>(null);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    };
  }, [screenshotPreview]);

  useEffect(() => {
    if (!showToast) return;
    const timer = setTimeout(() => setShowToast(false), 2500);
    return () => clearTimeout(timer);
  }, [showToast]);

  function reset() {
    setType('bug');
    setDescription('');
    setSeverity(null);
    setScreenshot(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
    setScreenshotError(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    setIsOpen(false);
    reset();
  }

  function handleScreenshotChange(file: File | null) {
    setScreenshotError(null);
    if (!file) {
      setScreenshot(null);
      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
      setScreenshotPreview(null);
      return;
    }
    const validationError = validateScreenshot(file);
    if (validationError) {
      setScreenshotError(validationError);
      setScreenshot(null);
      return;
    }
    setScreenshot(file);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(URL.createObjectURL(file));
  }

  const canSubmit = description.trim().length >= 10 && (type !== 'bug' || severity !== null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting || !canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await submitFeedback({
        type,
        description,
        severity,
        pageRoute: pathname,
        screenshot,
      });
      setIsOpen(false);
      reset();
      setShowToast(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="feedback-trigger"
        onClick={() => setIsOpen(true)}
        aria-label="Send feedback"
      >
        💬 Feedback
      </button>

      {isOpen && (
        <div className="modal-overlay" onClick={handleClose}>
          <div className="modal feedback-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <span className="modal__title">Send feedback</span>
              <button type="button" className="modal__close" onClick={handleClose} aria-label="Close">
                ×
              </button>
            </div>

            <form className="feedback-form" onSubmit={handleSubmit}>
              <div className="chip-row">
                {(['bug', 'idea', 'general'] as FeedbackType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`chip${type === t ? ' is-selected' : ''}`}
                    onClick={() => setType(t)}
                  >
                    {t === 'bug' ? 'Bug' : t === 'idea' ? 'Idea' : 'General'}
                  </button>
                ))}
              </div>

              <textarea
                placeholder="What's going on?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
              {description.trim().length > 0 && description.trim().length < 10 && (
                <p className="feedback-hint">A few more details would help (10 characters minimum).</p>
              )}

              {type === 'bug' && (
                <div className="chip-row">
                  <button
                    type="button"
                    className={`chip${severity === 'blocker' ? ' is-selected' : ''}`}
                    onClick={() => setSeverity('blocker')}
                  >
                    Blocks me
                  </button>
                  <button
                    type="button"
                    className={`chip${severity === 'minor' ? ' is-selected' : ''}`}
                    onClick={() => setSeverity('minor')}
                  >
                    Annoying but I can continue
                  </button>
                </div>
              )}

              <div className="feedback-screenshot">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleScreenshotChange(e.target.files?.[0] || null)}
                />
                {screenshotError && <p className="auth-error">{screenshotError}</p>}
                {screenshotPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={screenshotPreview} alt="Screenshot preview" className="feedback-screenshot__preview" />
                )}
              </div>

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" className="add-form__submit" disabled={isSubmitting || !canSubmit}>
                {isSubmitting ? 'Sending…' : 'Send feedback'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showToast && <div className="feedback-toast">Thanks for the feedback!</div>}
    </>
  );
}
