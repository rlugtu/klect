import { useState } from 'react';
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { trpc } from '@/client/api';
import { toast, errorMessage } from '@/client/toast';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

export type ReportTargetType = 'USER' | 'COMMENT' | 'MESSAGE' | 'LIST_CHAT_MESSAGE';

/** Reasons — kept in sync with web's REPORT_REASON_OPTIONS + core REPORT_REASONS. */
const REASONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'sexual', label: 'Nudity or sexual content' },
  { value: 'violence', label: 'Violence or threats' },
  { value: 'other', label: 'Something else' },
];

/**
 * A themed modal for reporting an abusive user or a piece of objectionable content. Pick a
 * reason, optionally add a note, submit via `moderation.report`. Reused from profiles, DM
 * messages, comments, and list-chat messages — the caller controls `visible` + supplies the
 * target. Mirrors web's `ReportControl`.
 */
export function ReportSheet({
  visible,
  onClose,
  targetType,
  targetId,
  title = 'Report',
}: {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  title?: string;
}) {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setReason(null);
    setNote('');
    setBusy(false);
  }

  async function submit() {
    if (!reason) {
      toast.error('Pick a reason.');
      return;
    }
    setBusy(true);
    try {
      await trpc.moderation.report.mutate({ targetType, targetId, reason, note });
      toast.success('Thanks — our team will review this.');
      reset();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't submit report."));
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
        className="justify-end">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="gap-3 rounded-t-3xl bg-bg p-5"
          style={{ paddingBottom: 40 }}>
          <Text className="font-serif text-xl text-ink">{title}</Text>
          <Text className="font-sans text-sm text-muted">
            Why are you reporting this?
          </Text>

          <View className="gap-2">
            {REASONS.map((r) => {
              const active = reason === r.value;
              return (
                <Pressable
                  key={r.value}
                  onPress={() => setReason(r.value)}
                  className={`flex-row items-center justify-between rounded-skin border bg-panel p-3 ${
                    active ? 'border-primary' : 'border-border'
                  }`}>
                  <Text className="font-sans text-base text-ink">{r.label}</Text>
                  {active && <Text className="text-primary">✓</Text>}
                </Pressable>
              );
            })}
          </View>

          <TextInput
            className="rounded-skin border-skin border-border bg-panel px-4 py-3 text-ink"
            placeholder="Add details (optional)"
            placeholderTextColor={t.muted}
            value={note}
            onChangeText={setNote}
            maxLength={2000}
            multiline
          />

          <Pressable
            disabled={busy}
            onPress={submit}
            className="items-center rounded-skin bg-danger py-3">
            <Text className="font-sans-semibold text-primary-ink">
              {busy ? 'Submitting…' : 'Submit report'}
            </Text>
          </Pressable>
          <Pressable onPress={onClose} className="items-center py-2">
            <Text className="font-sans text-muted">Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
