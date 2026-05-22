/**
 * SecureExamWrapper Component
 * Wraps exam player with security controls:
 * - Fullscreen enforcement
 * - Tab switch detection  
 * - Keyboard shortcuts blocking
 * - Page navigation prevention
 * - Violation monitoring
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AlertTriangle, AlertCircle, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import {
  disableContextMenu,
  disableTextSelection,
  disableKeyboardShortcuts,
  preventPageNavigation,
  cleanupPageNavigationPrevention,
  generateBrowserFingerprint,
  getOrCreateDeviceId,
} from '../utils/exam-security';
import { useFullscreenGuard } from '../hooks/useFullscreenGuard';
import { useTabSwitchDetection } from '../hooks/useTabSwitchDetection';
import { recordViolationWithCheck, submitExamAttempt } from '../services/exam.service';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SecureExamWrapperProps {
  examId: string;
  attemptId: string;
  children: React.ReactNode;
  enabled?: boolean;
  onAutoSubmit?: () => void;
}

export function SecureExamWrapper({
  examId,
  attemptId,
  children,
  enabled = true,
  onAutoSubmit,
}: SecureExamWrapperProps) {
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [violationMessage, setViolationMessage] = useState('');
  const [localViolationCount, setLocalViolationCount] = useState(0);
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isAutoSubmittingRef = useRef(false);

  const handleAutoSubmit = useCallback(async () => {
    if (isAutoSubmittingRef.current || isSubmitting) return;
    isAutoSubmittingRef.current = true;
    setIsSubmitting(true);
    
    try {
      const result = await submitExamAttempt(attemptId);
      if (result.success) {
        toast.error('Exam auto-submitted due to security violations');
        if (onAutoSubmit) onAutoSubmit();
      }
    } catch (error) {
      console.error('Auto-submit failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [attemptId, onAutoSubmit, isSubmitting]);

  // Fullscreen guard
  const fullscreenGuard = useFullscreenGuard({
    enabled: enabled && !shouldAutoSubmit,
    onViolation: async (count, isAutoSubmit) => {
      // 1st violation: Warning popup only
      // 2nd violation: Warning + database log
      // 3rd violation: Auto-submit test
      
      const newCount = localViolationCount + 1;
      setLocalViolationCount(newCount);

      if (newCount === 1) {
        setViolationMessage('Fullscreen mode is required. Please re-enter fullscreen to continue.');
        setShowViolationModal(true);
      } else if (newCount === 2) {
        setViolationMessage('Second fullscreen violation. This has been logged. One more will result in auto-submission.');
        setShowViolationModal(true);
        await recordViolationWithCheck(attemptId, 'fullscreen_exit', { count: newCount });
      } else if (newCount >= 3) {
        setShouldAutoSubmit(true);
        setViolationMessage('Maximum violations reached. Your exam is being auto-submitted.');
        setShowViolationModal(true);
        await recordViolationWithCheck(attemptId, 'fullscreen_exit', { count: newCount });
        handleAutoSubmit();
      }
    },
    maxViolations: 3,
  });

  // Tab switch detection
  const tabDetection = useTabSwitchDetection({
    enabled: enabled && !shouldAutoSubmit,
    onViolation: async (violationType) => {
      const newCount = localViolationCount + 1;
      setLocalViolationCount(newCount);

      if (newCount === 1) {
        setViolationMessage(`${violationType === 'tab_switch' ? 'Tab switch' : 'Window focus loss'} detected. Please stay on this page.`);
        setShowViolationModal(true);
      } else if (newCount === 2) {
        setViolationMessage(`Second violation detected (${violationType}). This has been logged.`);
        setShowViolationModal(true);
        await recordViolationWithCheck(attemptId, violationType);
      } else if (newCount >= 3) {
        setShouldAutoSubmit(true);
        setViolationMessage('Maximum violations reached. Your exam is being auto-submitted.');
        setShowViolationModal(true);
        const result = await recordViolationWithCheck(attemptId, violationType);
        if (result.data?.shouldAutoSubmit || newCount >= 3) {
          handleAutoSubmit();
        }
      }
    },
  });

  // Setup security measures on mount
  useEffect(() => {
    if (!enabled) return;

    disableContextMenu(document);
    disableTextSelection(document.body);
    disableKeyboardShortcuts(document);
    preventPageNavigation('Are you sure you want to leave? Your exam will be auto-submitted.');

    return () => {
      cleanupPageNavigationPrevention();
    };
  }, [enabled]);

  // Initial fullscreen requirement overlay
  if (enabled && !fullscreenGuard.isFullscreen && localViolationCount === 0 && !shouldAutoSubmit) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="mx-auto size-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Maximize className="size-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Fullscreen Required</h2>
            <p className="text-muted-foreground">
              This exam requires fullscreen mode to ensure a secure testing environment. 
              Please enable fullscreen to begin your test.
            </p>
          </div>
          <Button size="lg" className="w-full" onClick={() => fullscreenGuard.requestFullscreen()}>
            Enable Fullscreen
          </Button>
          <p className="text-xs text-muted-foreground">
            By starting this test, you agree to follow the examination rules and stay in fullscreen mode.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {children}

      {/* Violation Modal */}
      <AlertDialog open={showViolationModal} onOpenChange={setShowViolationModal}>
        <AlertDialogContent className="z-[10000]">
          <AlertDialogTitle className="flex items-center gap-2">
            {shouldAutoSubmit ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            )}
            {shouldAutoSubmit ? 'Exam Auto-Submission' : 'Exam Policy Violation'}
          </AlertDialogTitle>

          <AlertDialogDescription className="space-y-3">
            <p className="font-medium text-foreground">{violationMessage}</p>
            
            <div className="text-sm text-muted-foreground">
              Violations recorded: <span className={cn("font-bold", localViolationCount >= 2 ? "text-destructive" : "text-foreground")}>
                {localViolationCount}/3
              </span>
            </div>

            {shouldAutoSubmit && (
              <div className="text-sm text-destructive font-bold animate-pulse">
                Your exam is being submitted automatically.
              </div>
            )}

            <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
              <p className="font-semibold mb-2">Examination Rules:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Maintain fullscreen mode at all times</li>
                <li>Do not switch tabs, windows, or applications</li>
                <li>Do not minimize the browser window</li>
                <li>Multiple violations result in automatic submission</li>
              </ul>
            </div>
          </AlertDialogDescription>

          <AlertDialogFooter>
            {!shouldAutoSubmit && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  setShowViolationModal(false);
                  if (!fullscreenGuard.isFullscreen) {
                    fullscreenGuard.requestFullscreen();
                  }
                }}
              >
                I Understand & Return to Test
              </Button>
            )}
            {shouldAutoSubmit && (
              <Button disabled className="w-full sm:w-auto">
                Submitting...
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
