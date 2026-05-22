/**
 * useTabSwitchDetection Hook
 * Detects tab switching, window blur, and other visibility changes
 * Records violations for security purposes
 */

import { useEffect, useCallback, useRef } from 'react';

interface UseTabSwitchDetectionProps {
  enabled: boolean;
  onViolation?: (violationType: string) => void;
  onVisibilityChange?: (isHidden: boolean) => void;
}

export function useTabSwitchDetection({
  enabled,
  onViolation,
  onVisibilityChange,
}: UseTabSwitchDetectionProps) {
  const lastViolationTimeRef = useRef<number>(0);
  const VIOLATION_DEBOUNCE_MS = 1000; // Increased debounce for stability
  const isEnabledRef = useRef(enabled);

  useEffect(() => {
    isEnabledRef.current = enabled;
  }, [enabled]);

  // Handle visibility change (tab switch)
  const handleVisibilityChange = useCallback(() => {
    if (!isEnabledRef.current) return;

    const isHidden = document.hidden;
    
    if (onVisibilityChange) {
      onVisibilityChange(isHidden);
    }

    if (isHidden) {
      const now = Date.now();
      if (now - lastViolationTimeRef.current > VIOLATION_DEBOUNCE_MS) {
        lastViolationTimeRef.current = now;
        console.debug('Exam Security: Tab switch detected');
        if (onViolation) {
          onViolation('tab_switch');
        }
      }
    }
  }, [onViolation, onVisibilityChange]);

  // Handle window blur (focus lost)
  const handleBlur = useCallback(() => {
    if (!isEnabledRef.current) return;

    // Wait a bit to see if it was just a temporary blur (e.g. browser chrome click)
    // or if the page actually becomes hidden
    setTimeout(() => {
      if (document.hidden) {
        // This is a real tab switch or minimize, handled by visibilitychange
        return;
      }

      // If we are here, the window lost focus but is still visible.
      // This could be:
      // 1. Browser permission popup (allow camera/mic) - should NOT be a violation
      // 2. Clicking browser address bar - should be a violation in strict mode
      // 3. App switching (Alt+Tab) where the app window is still partially visible
      
      const now = Date.now();
      if (now - lastViolationTimeRef.current > VIOLATION_DEBOUNCE_MS) {
        lastViolationTimeRef.current = now;
        console.debug('Exam Security: Window blur detected');
        if (onViolation) {
          onViolation('window_blur');
        }
      }
    }, 200);
  }, [onViolation]);

  // Handle window focus (focus gained)
  const handleFocus = useCallback(() => {
    console.debug('Exam Security: Window focused');
  }, []);

  // Prevent keyboard shortcuts that facilitate switching
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isEnabledRef.current) return;

      // Alt+Tab (9 is Tab)
      if (e.altKey && e.keyCode === 9) {
        e.preventDefault();
        if (onViolation) onViolation('alt_tab_attempt');
      }

      // Cmd+Tab (9 is Tab)
      if (e.metaKey && e.keyCode === 9) {
        e.preventDefault();
        if (onViolation) onViolation('cmd_tab_attempt');
      }

      // Win key (91, 92) or Cmd key (91, 93)
      if (e.keyCode === 91 || e.keyCode === 92 || e.keyCode === 93) {
        // We don't necessarily want to prevent it (might be hard), but we can log it if it leads to blur
      }
    },
    [onViolation]
  );

  // Setup listeners
  useEffect(() => {
    // We add listeners even if disabled, but the handlers check isEnabledRef
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleVisibilityChange, handleBlur, handleFocus, handleKeyDown]);

  return {
    isPageHidden: document.hidden,
  };
}
