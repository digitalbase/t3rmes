import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarInset } from '../t3/components/ui/sidebar.tsx';
import { MessageCircle, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import './styles.css';

const seed = [
  { role: 'assistant', text: 'Ready when you are. Ask me to inspect, explain, or change something.' },
];

function fakeReply(prompt, onToken, onDone) {
  const answer = `I received “${prompt}”. The local Hermes transport is connected and ready for the next integration step.`;
  let index = 0;
  const timer = setInterval(() => {
    onToken(answer.slice(index, index + 3));
    index += 3;
    if (index >= answer.length) {
      clearInterval(timer);
      onDone();
    }
  }, 24);
  return () => clearInterval(timer);
}

function App() {
  const [messages, setMessages] = useState(seed);
  const [draft, setDraft] = useState('');
  const [running, setRunning] = useState(false);
  const [screen, setScreen] = useState('chat');
  const cancelRef = useRef(null);
  const composerRef = useRef(null);

  useEffect(() => () => cancelRef.current?.(), []);

  function send() {
    const prompt = draft.trim();
    if (!prompt || running) return;
    setDraft('');
    setMessages((current) => [...current, { role: 'user', text: prompt }, { role: 'assistant', text: '', streaming: true }]);
    setRunning(true);
    cancelRef.current = fakeReply(
      prompt,
      (token) => setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, text: message.text + token } : message)),
      () => { setRunning(false); cancelRef.current = null; setMessages((current) => current.map((message) => ({ ...message, streaming: false }))); },
    );
  }

  function stop() {
    cancelRef.current?.();
    cancelRef.current = null;
    setRunning(false);
    setMessages((current) => current.map((message) => ({ ...message, streaming: false })));
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  return (
    <main className="app-shell">
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="none" variant="sidebar">
          <SidebarHeader><div className="t3-brand"><Sparkles size={16} /> t3rmes</div></SidebarHeader>
          <SidebarContent><SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton isActive={screen === 'chat'} onClick={() => setScreen('chat')}><MessageCircle /><span>Chat</span></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu></SidebarContent>
          <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton isActive={screen === 'settings'} onClick={() => setScreen('settings')}><SettingsIcon /><span>Settings</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
        </Sidebar>
        <SidebarInset><header className="topbar"><div className="connection"><span className="status-dot" /> Local Hermes <span className="version">0.0.1</span></div></header>{screen === 'settings' ? <Settings onBack={() => setScreen('chat')} /> : <Chat messages={messages} draft={draft} setDraft={setDraft} running={running} send={send} stop={stop} onKeyDown={onKeyDown} />}</SidebarInset>
      </SidebarProvider>
    </main>
  );
}

function Chat({ messages, draft, setDraft, running, send, stop, onKeyDown }) {
  return <section className="chat">
        <div className="transcript">
          {messages.map((message, index) => (
            <article className={`message ${message.role}`} key={`${index}-${message.text}`}>
              <div className="avatar">{message.role === 'assistant' ? '✦' : 'You'}</div>
              <div className="message-body">
                <div className="message-label">{message.role === 'assistant' ? 'Hermes' : 'You'}</div>
                <div className="message-text">{message.text}{message.streaming && <span className="cursor" />}</div>
              </div>
            </article>
          ))}
        </div>
        <div className="composer-wrap">
          <div className="composer">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="Ask Hermes anything…" rows="1" />
            <button className={running ? 'stop' : 'send'} onClick={running ? stop : send} aria-label={running ? 'Stop response' : 'Send message'}>{running ? '■' : '↑'}</button>
          </div>
          <div className="composer-hint">Enter to send · Shift+Enter for a new line</div>
        </div>
      </section>;
}

function Settings({ onBack }) {
  return <section className="settings-page">
    <div className="settings-heading"><button className="back-button" onClick={onBack}>←</button><div><div className="eyebrow">PREFERENCES</div><h1>Settings</h1></div></div>
    <div className="settings-group">
      <div className="group-title">Hermes connection</div>
      <div className="setting-row"><div><strong>Connection</strong><span>Use the local Hermes runtime on this computer.</span></div><span className="pill"><span className="status-dot" /> Connected</span></div>
      <div className="setting-row"><div><strong>Working directory</strong><span>The folder Hermes uses for files and commands.</span></div><code>~/Work</code></div>
    </div>
    <div className="settings-group">
      <div className="group-title">Response defaults</div>
      <div className="setting-row"><div><strong>Model</strong><span>Use Hermes's configured default model.</span></div><span className="select-value">Default <span>⌄</span></span></div>
      <div className="setting-row"><div><strong>Appearance</strong><span>Follow the operating system.</span></div><span className="select-value">System <span>⌄</span></span></div>
    </div>
  </section>;
}

createRoot(document.getElementById('root')).render(<App />);
