import { useEffect, useState } from 'react';

type CopyStatus = 'copied' | 'manual';

export function useCopyFeedback(resetAfterCopy: boolean) {
  const [feedback, setFeedback] = useState<{ status: CopyStatus }>();

  useEffect(() => {
    if (!resetAfterCopy || feedback?.status !== 'copied') return;
    const timer = window.setTimeout(() => {
      // A successful recopy gets its own countdown, even as this timer expires.
      setFeedback((current) => current === feedback ? undefined : current);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [feedback, resetAfterCopy]);

  function report(status: CopyStatus) {
    setFeedback({ status });
  }

  return [feedback?.status, report] as const;
}
