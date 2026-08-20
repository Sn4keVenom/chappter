// src/pages/messages/MessagesPage.tsx
//
// Messaging. One route component serves both /messages and /messages/:channelId
// because the two panes are the same UI at different widths:
//
//   mobile   one pane at a time — the list, or the open conversation
//   desktop  the conventional two-pane client, list beside conversation
//
// The URL is always the source of truth for which channel is open, so a
// conversation can be linked to, refreshed, and reached with Back/Forward.
//
// Keyboard behaviour on mobile web is handled by layout rather than by
// measuring the keyboard: the shell is sized in `dvh` (which shrinks when the
// on-screen keyboard opens) and the transcript uses `column-reverse`, so the
// newest message stays pinned just above the composer with no scroll maths.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useMessagesStore } from "../../store/useMessagesStore";
import { useAuthStore } from "../../store/useAuthStore";
import { usePermissions } from "../../hooks/usePermissions";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { EmptyState, ErrorBanner, LoadingState, Spinner } from "../../components/ui/Feedback";
import { formatRelativeShort, formatTime } from "../../utils/format";
import type { Channel, ChannelType, Message } from "../../types";
import styles from "./MessagesPage.module.css";

const CHANNEL_ICON: Record<ChannelType, string> = {
  GENERAL: "#",
  COMMITTEE: "⬡",
  OFFICERS: "🔒",
  DM: "◉",
};

const GROUP_ORDER: ChannelType[] = ["GENERAL", "OFFICERS", "COMMITTEE", "DM"];

const GROUP_LABEL: Record<ChannelType, string> = {
  GENERAL: "Announcements",
  OFFICERS: "Officers",
  COMMITTEE: "Committees",
  DM: "Direct Messages",
};

function ChannelRow({ channel, active }: { channel: Channel; active: boolean }) {
  return (
    <Link
      to={`/messages/${channel.id}`}
      className={[styles.channel, active ? styles.channelActive : ""].filter(Boolean).join(" ")}
      aria-current={active ? "page" : undefined}
    >
      <span className={styles.channelAvatar} aria-hidden="true">
        {CHANNEL_ICON[channel.type]}
      </span>
      <span className={styles.channelBody}>
        <span className={styles.channelTop}>
          <span className={styles.channelName}>{channel.name}</span>
          {channel.lastMessage ? (
            <span className={styles.channelTime}>
              {formatRelativeShort(channel.lastMessage.createdAt)}
            </span>
          ) : null}
        </span>
        {channel.lastMessage ? (
          <span className={styles.channelPreview}>
            <span className={styles.channelSender}>
              {channel.lastMessage.senderName.split(" ")[0]}:{" "}
            </span>
            {channel.lastMessage.content}
          </span>
        ) : (
          <span className={`${styles.channelPreview} ${styles.channelEmpty}`}>No messages yet</span>
        )}
      </span>
      {!channel.canPost ? <span className={styles.readOnly}>view only</span> : null}
    </Link>
  );
}

function MessageBubble({
  message,
  isMine,
  canPin,
  onTogglePin,
}: {
  message: Message;
  isMine: boolean;
  canPin: boolean;
  onTogglePin: () => void;
}) {
  return (
    <div className={[styles.bubbleRow, isMine ? styles.bubbleRowMine : ""].filter(Boolean).join(" ")}>
      <div className={[styles.bubble, isMine ? styles.bubbleMine : ""].filter(Boolean).join(" ")}>
        {!isMine ? (
          <p className={styles.bubbleSender}>
            {message.sender.firstName} {message.sender.lastName}
          </p>
        ) : null}
        <p className={styles.bubbleText}>{message.content}</p>
        <div className={styles.bubbleMeta}>
          {message.pinned ? <span aria-label="Pinned">📌</span> : null}
          <span className={styles.bubbleTime}>{formatTime(message.createdAt)}</span>
          {canPin ? (
            <button
              type="button"
              onClick={onTogglePin}
              className={styles.bubbleTime}
              style={{ textDecoration: "underline", color: "inherit" }}
            >
              {message.pinned ? "Unpin" : "Pin"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Conversation({ channelId }: { channelId: string }) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const { isOfficerOrAbove } = usePermissions();
  const { channels, channelData, fetchMessages, loadMoreMessages, sendMessage, togglePin } =
    useMessagesStore();

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pinTarget, setPinTarget] = useState<Message | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const cache = channelData[channelId];
  const messages = cache?.messages ?? [];
  const pinned = cache?.pinned ?? [];

  const channel = channels.find((c) => c.id === channelId);
  // Fail closed: showing a composer for a channel whose permissions we don't
  // know yet would let a member type a message that the server then rejects.
  const canPost = channel?.canPost ?? false;

  useEffect(() => {
    fetchMessages(channelId);
  }, [channelId, fetchMessages]);

  // Grow the composer with its content up to the CSS max-height, then let it
  // scroll internally — so a long draft never pushes the send button away.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setSending(true);
    try {
      await sendMessage(channelId, text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline — the convention every
    // desktop chat client uses. On touch devices Enter inserts a newline
    // instead, because there is no Shift modifier within easy reach and the
    // send button is right there.
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (event.key === "Enter" && !event.shiftKey && !isTouch) {
      event.preventDefault();
      handleSend();
    }
  }

  if (!cache && !channel) return <LoadingState label="Opening conversation…" />;

  return (
    <section className={styles.conversation} aria-label={channel?.name ?? "Conversation"}>
      <header className={styles.conversationHeader}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate("/messages")}
          aria-label="Back to conversations"
        >
          ‹
        </button>
        <h1 className={styles.conversationTitle}>{channel?.name ?? "Channel"}</h1>
      </header>

      {pinned.length > 0 ? (
        <div className={styles.pinned}>
          <span aria-hidden="true">📌</span>
          <span className={styles.pinnedText}>{pinned[0].content}</span>
        </div>
      ) : null}

      <div className={styles.transcript} role="log" aria-live="polite" aria-label="Messages">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isMine={message.sender.id === currentUser?.id}
            canPin={isOfficerOrAbove}
            onTogglePin={() => setPinTarget(message)}
          />
        ))}
        {cache?.hasMore ? (
          <div style={{ display: "grid", placeItems: "center", padding: "var(--space-4)" }}>
            <Button size="sm" variant="ghost" onClick={() => loadMoreMessages(channelId)}>
              Load earlier messages
            </Button>
          </div>
        ) : null}
        {messages.length === 0 && cache ? (
          <EmptyState icon="💬" title="No messages yet" body="Start the conversation below." />
        ) : null}
      </div>

      {canPost ? (
        <div className={styles.composer}>
          <label htmlFor="composer" className="sr-only">
            Message {channel?.name ?? "channel"}
          </label>
          <textarea
            id="composer"
            ref={inputRef}
            className={styles.composerInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            rows={1}
            maxLength={4000}
          />
          <button
            type="button"
            className={styles.sendButton}
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            aria-label="Send message"
          >
            {sending ? <Spinner small label="Sending" /> : "→"}
          </button>
        </div>
      ) : (
        <p className={styles.readOnlyBar}>This channel is read-only for your role.</p>
      )}

      <ConfirmDialog
        open={pinTarget !== null}
        onClose={() => setPinTarget(null)}
        onConfirm={() => {
          if (pinTarget) togglePin(channelId, pinTarget.id, !pinTarget.pinned);
          setPinTarget(null);
        }}
        title={pinTarget?.pinned ? "Unpin message?" : "Pin message?"}
        body={
          pinTarget?.pinned
            ? "Remove this message from the pinned section."
            : "Pin this message to the top of the channel for everyone."
        }
        confirmLabel={pinTarget?.pinned ? "Unpin" : "Pin"}
      />
    </section>
  );
}

export default function MessagesPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const { channels, loading, error, fetchChannels } = useMessagesStore();

  const load = useCallback(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(
    () =>
      GROUP_ORDER.map((type) => ({
        type,
        channels: channels.filter((c) => c.type === type),
      })).filter((group) => group.channels.length > 0),
    [channels]
  );

  if (loading && channels.length === 0) {
    return (
      <div className={styles.shell}>
        <LoadingState />
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      {/* On mobile the list hides itself once a channel is open. */}
      <div
        className={[styles.listPane, channelId ? styles.paneHiddenMobile : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {error && channels.length === 0 ? (
          <div style={{ padding: "var(--space-4)" }}>
            <ErrorBanner message={error} onRetry={load} />
          </div>
        ) : null}

        <nav className={styles.list} aria-label="Conversations">
          <h1 className="sr-only">Messages</h1>
          {grouped.length === 0 ? (
            <EmptyState icon="✉️" title="No channels" body="You don't have access to any channels yet." />
          ) : (
            grouped.map((group) => (
              <div key={group.type}>
                <h2 className={styles.groupHeader}>{GROUP_LABEL[group.type]}</h2>
                {group.channels.map((channel) => (
                  <ChannelRow key={channel.id} channel={channel} active={channel.id === channelId} />
                ))}
              </div>
            ))
          )}
        </nav>
      </div>

      {/* On mobile the conversation replaces the list; on desktop it sits
          beside it, with a placeholder when nothing is open. */}
      {channelId ? (
        <Conversation key={channelId} channelId={channelId} />
      ) : (
        <div className={`${styles.conversation} ${styles.paneHiddenMobile}`}>
          <div className={styles.placeholder}>
            <EmptyState
              icon="💬"
              title="Select a conversation"
              body="Choose a channel from the list to start reading and posting."
            />
          </div>
        </div>
      )}
    </div>
  );
}
