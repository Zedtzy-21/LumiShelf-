import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  BookOpen,
  Search,
  Scale,
  Heart,
  LogIn,
  Trash2,
  Loader2,
  Bot
} from 'lucide-react';

// Human-friendly labels & icons for each backend agent tool executed
const TOOL_BADGE_MAP = {
  search_books: { label: 'Searched Catalog', Icon: Search },
  get_book_details: { label: 'Read Book Details', Icon: BookOpen },
  compare_books: { label: 'Compared Books', Icon: Scale },
  save_book_to_favorites: { label: 'Saved to Library', Icon: Heart }
};

// 3 Starter Chips displayed when chat history is empty
const STARTER_PROMPTS = [
  'Recommend 2 popular science books',
  'Compare two philosophy books in the library',
  'Find a classic adventure novel and help me save it'
];

/**
 * LumiAiWidget
 * Floating "Ask Lumi AI" trigger button + interactive dark-indigo agentic chat drawer.
 */
export default function LumiAiWidget({
  session = null,
  apiBaseUrl = 'http://localhost:5000',
  onLibraryUpdated,
  onOpenAuth
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to latest message whenever messages or loading state changes
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [isOpen]);

  /**
   * Sends a user message + recent chat history to POST /api/ai/chat
   */
  const sendMessage = async (textToSend) => {
    const trimmed = (textToSend || '').trim();
    if (!trimmed || isLoading) return;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      text: trimmed
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      // Prepare concise role/text history for contextual follow-up turns
      const historyPayload = updatedMessages.slice(-10).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        text: m.text
      }));

      const headers = {
        'Content-Type': 'application/json'
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload.slice(0, -1) // exclude current message since it's passed in `message`
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reach Lumi AI');
      }

      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        text: data.reply,
        toolsUsed: data.toolsUsed || [],
        libraryUpdated: Boolean(data.libraryUpdated),
        authRequired: Boolean(data.authRequired),
        awaitingConfirmation: Boolean(data.awaitingConfirmation)
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Immediately refresh navbar My Library (X) counter & heart icons if a book was saved
      if (data.libraryUpdated && typeof onLibraryUpdated === 'function') {
        onLibraryUpdated();
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: `Sorry, I ran into a connection issue: ${err.message}. Please make sure the backend server is running.`,
          isError: true
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleClearChat = () => {
    setMessages([]);
    setInputValue('');
  };

  return (
    <>
      {/* Floating Trigger Button (Option A — Bottom Right) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full bg-[#FFB703] px-5 py-3.5 text-sm font-bold text-[#13172E] shadow-[0_10px_30px_rgba(255,183,3,0.35)] transition-all duration-200 hover:scale-105 hover:bg-amber-400 active:scale-95"
          aria-label="Ask Lumi AI"
        >
          <Sparkles className="h-5 w-5 text-[#13172E]" />
          <span>Ask Lumi AI</span>
        </button>
      )}

      {/* Interactive Glass-Dark Chat Drawer */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 flex h-[540px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#13172E]/95 shadow-2xl backdrop-blur-xl sm:w-[420px]"
          role="dialog"
          aria-label="Lumi AI Scholar Chat"
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-[#0D1021]/90 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFB703]/15 text-[#FFB703] border border-[#FFB703]/30">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-wide text-white">
                  Lumi AI Scholar
                </h3>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Connected to Catalog</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  title="Clear conversation"
                  className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close Lumi AI"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close Lumi AI"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Message Feed */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-white/10">
            {messages.length === 0 ? (
              /* Empty State + 3 Starter Chips */
              <div className="flex h-full flex-col justify-between py-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                  <div className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-[#FFB703]/15 text-[#FFB703]">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-white">
                    Your Personal Literary Agent
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    I can search our 200+ book catalog, read opening excerpts, compare titles side-by-side, and save picks to your library.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Try asking Lumi AI
                  </p>
                  {STARTER_PROMPTS.map((promptText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => sendMessage(promptText)}
                      className="w-full rounded-xl border border-white/10 bg-[#1C2242]/70 px-3.5 py-2.5 text-left text-xs text-slate-200 transition-all hover:border-[#FFB703]/50 hover:bg-[#1C2242] hover:text-[#FFB703]"
                    >
                      “{promptText}”
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const isLatestMessage = index === messages.length - 1;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                        isUser
                          ? 'rounded-br-sm border border-[#FFB703]/30 bg-[#FFB703]/15 text-amber-50'
                          : msg.isError
                          ? 'rounded-bl-sm border border-red-500/30 bg-red-500/10 text-red-200'
                          : 'rounded-bl-sm border border-white/10 bg-[#1C2242]/90 text-slate-100'
                      }`}
                    >
                      {/* Tool Execution Badges (proves connected database tool calls) */}
                      {!isUser && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                        <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-white/10 pb-2">
                          {msg.toolsUsed.map((toolName) => {
                            const badge = TOOL_BADGE_MAP[toolName];
                            if (!badge) return null;
                            const IconComp = badge.Icon;
                            return (
                              <span
                                key={toolName}
                                className="inline-flex items-center gap-1 rounded-full bg-[#FFB703]/10 px-2 py-0.5 text-[10px] font-medium text-[#FFB703] border border-[#FFB703]/20"
                              >
                                <IconComp className="h-2.5 w-2.5" />
                                <span>{badge.label}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Message Text (preserves line breaks cleanly) */}
                      <div className="whitespace-pre-wrap break-words">
                        {msg.text}
                      </div>

                      {/* Smart Confirmation Pills (shown when Lumi asks to confirm saving) */}
                      {!isUser &&
                        msg.awaitingConfirmation &&
                        isLatestMessage &&
                        !isLoading && (
                          <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-2.5">
                            <button
                              type="button"
                              onClick={() => sendMessage('Yes, please save it.')}
                              className="inline-flex items-center gap-1.5 rounded-full bg-[#FFB703] px-3 py-1.5 text-[11px] font-bold text-[#13172E] transition-colors hover:bg-amber-400"
                            >
                              <Heart className="h-3 w-3 fill-current" />
                              <span>Yes, Save to Library</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => sendMessage('No, thanks.')}
                              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                            >
                              No, Thanks
                            </button>
                          </div>
                        )}

                      {/* Guest Auth Action Button (shown when Guest tries to save a book) */}
                      {!isUser && msg.authRequired && (
                        <div className="mt-3 border-t border-white/10 pt-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              setIsOpen(false);
                              if (typeof onOpenAuth === 'function') {
                                onOpenAuth();
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#FFB703] px-3.5 py-1.5 text-[11px] font-bold text-[#13172E] transition-colors hover:bg-amber-400"
                          >
                            <LogIn className="h-3.5 w-3.5" />
                            <span>Sign In / Create Account</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Thinking / Tool-Chaining Indicator */}
            {isLoading && (
              <div className="flex items-start">
                <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm border border-white/10 bg-[#1C2242]/90 px-3.5 py-2.5 text-xs text-slate-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#FFB703]" />
                  <span>Lumi is checking the catalog...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Composer */}
          <form
            onSubmit={handleFormSubmit}
            className="border-t border-white/10 bg-[#0D1021]/90 p-3"
          >
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-[#13172E] px-3 py-1.5 focus-within:border-[#FFB703]">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about books, authors, or comparisons..."
                disabled={isLoading}
                className="flex-1 bg-transparent py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFB703] text-[#13172E] transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}