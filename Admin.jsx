import React, { useCallback, useEffect, useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { apiRequest, formatDate, mediaUrl, schoolGreeting } from './api.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { showToast } from './notifications.js';
import {
  DEFAULT_COLOR_PALETTES,
  DEFAULT_SITE_COLORS,
  DEFAULT_SITE_IMAGES,
  DEFAULT_WHATSAPP_CONTACT_TEMPLATE,
  DEFAULT_WHATSAPP_WELCOME_MESSAGE,
} from './site-theme.js';
import './admin.css';

const emptyPost = {
  type: 'news',
  title: '',
  summary: '',
  content: '',
  eventDate: '',
  eventEndDate: '',
  eventTime: '',
  eventLocation: '',
  eventRegistrationUrl: '',
  metaTitle: '',
  metaDescription: '',
  featuredImage: '',
  published: false,
};

const admissionStatuses = ['new', 'reviewing', 'accepted', 'waitlisted', 'declined'];
const classLabels = {
  baby: 'Baby Class',
  middle: 'Middle Class',
  top: 'Top Class',
  primary_1: 'Primary 1',
  primary_2: 'Primary 2',
  primary_3: 'Primary 3',
  primary_4: 'Primary 4',
  primary_5: 'Primary 5',
  primary_6: 'Primary 6',
  primary_7: 'Primary 7',
};

function Login({ onLogin, notice }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      onLogin(await apiRequest('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }));
      showToast('Signed in to the school office.', 'success');
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return <main className="gv-admin-login-wrap">
    <form className="gv-admin-login" onSubmit={submit}>
      <a className="gv-admin-back" href="#/home">← Back to Golden Valley</a>
      <p className="gv-eyebrow">Golden Valley School</p>
      <h1>Welcome <em>back.</em></h1>
      <p className="gv-admin-login-intro">Sign in to manage applications, news, and school updates.</p>
      {notice && <p className="gv-admin-error" role="alert">{notice}</p>}
      <label>Username<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="gv-admin-error" role="alert">{error}</p>}
      <button className="gv-button" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">↗</span></button>
    </form>
  </main>;
}

function PostEditor({ post, onSave, onCancel, busy, error, csrfToken, media, onUploadImage }) {
  const [draft, setDraft] = useState(post);
  const [editorState, setEditorState] = useState('loading');
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const tinyKey = import.meta.env.VITE_TINYMCE_API_KEY;
  const tinyUrl = tinyKey ? `https://cdn.tiny.cloud/1/${tinyKey}/tinymce/7/tinymce.min.js` : '';

  useEffect(() => {
    if (!tinyUrl) {
      setEditorState('error');
      return undefined;
    }
    if (window.tinymce?.init) {
      setEditorState('loaded');
      return undefined;
    }
    let script = document.getElementById('gv-tinymce-cloud');
    if (!script) {
      script = document.createElement('script');
      script.id = 'gv-tinymce-cloud';
      script.src = tinyUrl;
      script.referrerPolicy = 'origin';
      script.async = true;
    }
    const handleLoad = () => setEditorState(window.tinymce?.init ? 'loaded' : 'error');
    const handleError = () => setEditorState('error');
    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    if (!script.isConnected) document.head.append(script);
    const timeout = window.setTimeout(() => setEditorState((current) => current === 'ready' ? current : 'error'), 20000);
    return () => {
      window.clearTimeout(timeout);
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
  }, [tinyUrl]);

  return <form className="gv-admin-editor-form" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
    <div className="gv-admin-editor-heading"><div><p className="gv-eyebrow">{post.id ? 'EDIT POST' : 'NEW POST'}</p><h2>{post.id ? 'Make an update.' : 'Share some news.'}</h2></div><button type="button" className="gv-admin-quiet" onClick={onCancel}>Close editor</button></div>
    <label>Post type<select value={draft.type} onChange={(event) => update('type', event.target.value)}><option value="news">News</option><option value="update">School update</option><option value="event">Event</option></select></label>
    <label>Title<input required maxLength="160" value={draft.title} onChange={(event) => update('title', event.target.value)} /></label>
    <label>Short summary<textarea required rows="2" maxLength="500" value={draft.summary} onChange={(event) => update('summary', event.target.value)} /></label>
    {draft.type === 'event' && <div className="gv-admin-event-fields">
      <label>Starts<input required type="date" value={draft.eventDate || ''} onChange={(event) => update('eventDate', event.target.value)} /></label>
      <label>Ends <span>(optional)</span><input type="date" min={draft.eventDate || undefined} value={draft.eventEndDate || ''} onChange={(event) => update('eventEndDate', event.target.value)} /></label>
      <label>Time<input maxLength="80" placeholder="e.g. 10:00 AM – 1:00 PM" value={draft.eventTime || ''} onChange={(event) => update('eventTime', event.target.value)} /></label>
      <label>Location<input maxLength="200" value={draft.eventLocation || ''} onChange={(event) => update('eventLocation', event.target.value)} /></label>
      <label>Registration link <span>(optional)</span><input type="url" value={draft.eventRegistrationUrl || ''} onChange={(event) => update('eventRegistrationUrl', event.target.value)} placeholder="https://" /></label>
    </div>}
    <label>Feature image from media library<select value={draft.featuredImage || ''} onChange={(event) => update('featuredImage', event.target.value)}><option value="">No feature image</option>{media.map((item) => <option value={mediaUrl(item)} key={item.id}>{item.altText || item.originalName}</option>)}</select></label>
    <ImageUploadField label="Or upload a feature image" value={draft.featuredImage || ''} onChange={(value) => update('featuredImage', value)} onUploadImage={onUploadImage} altText={draft.title} />
    {draft.featuredImage && <img className="gv-admin-feature-preview" src={draft.featuredImage} alt="Selected feature image preview" />}
    <label>Article content</label>
    <div className="gv-admin-tinymce">
      {editorState === 'loading' && <div className="gv-admin-editor-status"><span className="gv-loading-spinner" aria-hidden="true"><i /><i /><i /></span><span>Connecting to the rich-text editor…</span></div>}
      {editorState === 'error' && <div className="gv-admin-editor-fallback"><p role="alert">The visual editor could not load. Check the TinyMCE API key, allowed domain, and internet connection. You can still write or edit the article below.</p><textarea aria-label="Article content (plain text fallback)" rows="14" value={draft.content} onChange={(event) => update('content', event.target.value)} /></div>}
      {editorState !== 'error' && editorState !== 'loading' && <Editor
        tinymceScriptSrc={tinyUrl}
        value={draft.content}
        onInit={() => setEditorState('ready')}
        onEditorChange={(content) => update('content', content)}
        init={{
          height: 480,
          min_height: 360,
          menubar: 'file edit view insert format tools table help',
          branding: false,
          promotion: false,
          statusbar: true,
          resize: true,
          plugins: 'advlist anchor autolink charmap code codesample directionality emoticons fullscreen help image insertdatetime link lists media nonbreaking pagebreak preview quickbars searchreplace table visualblocks visualchars wordcount',
          toolbar: 'undo redo | blocks fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image media table | blockquote codesample | removeformat code fullscreen',
          toolbar_mode: 'sliding',
          quickbars_selection_toolbar: 'bold italic | quicklink h2 h3 blockquote',
          automatic_uploads: true,
          images_upload_handler: async (blobInfo, progress) => {
            const imageUrl = await onUploadImage(blobInfo.blob(), blobInfo.filename());
            progress(100);
            return imageUrl;
          },
          content_style: 'body { font-family: "DM Sans", sans-serif; font-size: 16px; color: #183f39; line-height: 1.75; }',
        }}
      />}
    </div>
    <details className="gv-admin-seo"><summary>Search engine settings (SEO)</summary>
      <label>SEO title <span>({(draft.metaTitle || draft.title || '').length}/70)</span><input maxLength="70" value={draft.metaTitle || ''} onChange={(event) => update('metaTitle', event.target.value)} placeholder={draft.title || 'Search result title'} /></label>
      <label>Meta description <span>({(draft.metaDescription || draft.summary || '').length}/180)</span><textarea rows="3" maxLength="180" value={draft.metaDescription || ''} onChange={(event) => update('metaDescription', event.target.value)} placeholder={draft.summary || 'A short description for search results'} /></label>
    </details>
    <label className="gv-admin-publish"><input type="checkbox" checked={Boolean(draft.published)} onChange={(event) => update('published', event.target.checked)} /> Publish this post on the public website</label>
    {error && <p className="gv-admin-error" role="alert">{error}</p>}
    <div className="gv-admin-editor-actions"><button className="gv-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save post'} <span aria-hidden="true">↗</span></button><button className="gv-admin-quiet" type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}

export default function Admin() {
  const [admin, setAdmin] = useState(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState('admissions');
  const [admissions, setAdmissions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageError, setMessageError] = useState('');
  const [comments, setComments] = useState([]);
  const [posts, setPosts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [media, setMedia] = useState([]);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState({});
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('gv-admin-theme') === 'dark');
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const refreshMessages = useCallback(async (notify = false) => {
    try {
      const result = await apiRequest('/api/admin/messages');
      setMessages(result.messages);
      setMessageError('');
      if (notify) showToast('Inbox refreshed.', 'success');
    } catch (requestError) {
      setMessageError(requestError.message);
      if (requestError.message.includes('Sign in')) setAdmin(null);
      if (notify) showToast(requestError.message, 'error');
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/admin/session')
      .then((session) => {
        if (cancelled) return;
        setAdmin(session.admin);
        setCsrfToken(session.csrfToken);
      })
      .catch((requestError) => {
        if (!requestError.message.includes('Sign in to access')) setAuthError(requestError.message);
      })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!admin) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      apiRequest('/api/admin/admissions'),
      apiRequest('/api/admin/posts'),
      apiRequest('/api/admin/staff'),
      apiRequest('/api/admin/media'),
      apiRequest('/api/admin/comments'),
      apiRequest('/api/site-settings'),
      admin.role === 'superadmin' ? apiRequest('/api/admin/users') : Promise.resolve({ users: [] }),
    ])
      .then(([admissionResult, postResult, staffResult, mediaResult, commentResult, settingsResult, userResult]) => {
        if (cancelled) return;
        setAdmissions(admissionResult.admissions);
        setPosts(postResult.posts);
        setStaff(staffResult.staff);
        setMedia(mediaResult.media);
        setComments(commentResult.comments);
        setSettings(settingsResult);
        setUsers(userResult.users);
      })
      .catch((requestError) => {
        if (cancelled) return;
        if (requestError.message.includes('Sign in')) setAdmin(null);
        setError(requestError.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [admin]);

  useEffect(() => {
    if (!admin) return undefined;
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const result = await apiRequest('/api/admin/messages');
        if (!cancelled) {
          setMessages(result.messages);
          setMessageError('');
        }
      } catch (requestError) {
        if (cancelled) return;
        setMessageError(requestError.message);
        if (requestError.message.includes('Sign in')) setAdmin(null);
      }
    };
    const refreshWhenVisible = () => { void refresh(); };
    void refresh();
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [admin]);

  useEffect(() => {
    localStorage.setItem('gv-admin-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  async function updateStatus(id, status) {
    setError('');
    try {
      await apiRequest(`/api/admin/admissions/${id}`, {
        method: 'PATCH',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ status }),
      });
      setAdmissions((current) => current.map((item) => item.id === id ? { ...item, status } : item));
      showToast('Application status updated.', 'success');
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    }
  }

  async function viewPreviousResults(id) {
    const downloadWindow = window.open('about:blank', '_blank');
    if (!downloadWindow) {
      showToast('Allow pop-ups to open the applicant’s private results file.', 'error');
      return;
    }
    downloadWindow.opener = null;
    downloadWindow.location.href = `/api/admin/admissions/${id}/results`;
  }

  async function savePost(post) {
    setSaving(true);
    setError('');
    try {
      const editingExisting = Boolean(post.id);
      await apiRequest(editingExisting ? `/api/admin/posts/${post.id}` : '/api/admin/posts', {
        method: editingExisting ? 'PUT' : 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(post),
      });
      const refreshed = await apiRequest('/api/admin/posts');
      setPosts(refreshed.posts);
      const refreshedMedia = await apiRequest('/api/admin/media');
      setMedia(refreshedMedia.media);
      setEditing(null);
      showToast(editingExisting ? 'Article updated.' : 'Article created.', 'success');
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveStaff(person) {
    const existing = Boolean(person.id);
    const result = await apiRequest(existing ? `/api/admin/staff/${person.id}` : '/api/admin/staff', {
      method: existing ? 'PUT' : 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(person),
    });
    setStaff((current) => existing
      ? current.map((item) => item.id === person.id ? result.staff : item)
      : [...current, result.staff]);
    showToast(existing ? 'Staff profile updated.' : 'Staff profile created.', 'success');
  }

  async function deleteStaff(person) {
    if (!window.confirm(`Remove ${person.name} from the public staff page?`)) return;
    await apiRequest(`/api/admin/staff/${person.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken } });
    setStaff((current) => current.filter((item) => item.id !== person.id));
    showToast('Staff profile removed.', 'success');
  }

  async function uploadMedia(file, altText, galleryVisible) {
    const body = new FormData();
    body.append('file', file);
    body.append('altText', altText);
    body.append('galleryVisible', String(galleryVisible));
    const result = await apiRequest('/api/admin/media', {
      method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body,
    });
    setMedia((current) => [result.media, ...current]);
    showToast('Image uploaded to the media library.', 'success');
    return result.media;
  }

  async function uploadContentImage(file, altText) {
    const uploaded = await uploadMedia(file, altText, false);
    return mediaUrl(uploaded);
  }

  async function uploadSiteIcon(file) {
    return uploadContentImage(file, `Site icon: ${file.name}`);
  }

  async function updateMedia(item, changes) {
    await apiRequest(`/api/admin/media/${item.id}`, {
      method: 'PATCH', headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify(changes),
    });
    setMedia((current) => current.map((mediaItem) => mediaItem.id === item.id ? { ...mediaItem, ...changes } : mediaItem));
    showToast('Media details updated.', 'success');
  }

  async function deleteMedia(item) {
    await apiRequest(`/api/admin/media/${item.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken } });
    setMedia((current) => current.filter((mediaItem) => mediaItem.id !== item.id));
    showToast('Image deleted from the media library.', 'success');
  }

  async function saveSettings(nextSettings) {
    const result = await apiRequest('/api/admin/settings', {
      method: 'PUT', headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify(nextSettings),
    });
    setSettings(result.settings);
    window.dispatchEvent(new CustomEvent('gv-site-settings-updated', { detail: result.settings }));
    showToast('School settings saved.', 'success');
  }

  async function markMessageRead(id) {
    await apiRequest(`/api/admin/messages/${id}/read`, {
      method: 'PATCH', headers: { 'X-CSRF-Token': csrfToken },
    });
    setMessages((current) => current.map((message) => message.id === id && message.status === 'new'
      ? { ...message, status: 'read' } : message));
  }

  async function replyToMessage(id, reply) {
    const result = await apiRequest(`/api/admin/messages/${id}/reply`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ reply }),
    });
    setMessages((current) => current.map((message) => message.id === id
      ? { ...message, status: 'replied', replyText: `${reply}\n\nWarm regards,\n${settings.schoolName || 'Golden Valley School'}`, repliedAt: result.repliedAt }
      : message));
    showToast('Email reply sent successfully.', 'success');
  }

  async function deleteMessage(message) {
    if (!window.confirm(`Delete the message from ${message.name}? This cannot be undone.`)) return;
    await apiRequest(`/api/admin/messages/${message.id}`, {
      method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken },
    });
    setMessages((current) => current.filter((item) => item.id !== message.id));
    showToast('Contact message deleted.', 'success');
  }

  async function updateComment(comment, status) {
    await apiRequest(`/api/admin/comments/${comment.id}`, {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ status }),
    });
    setComments((current) => current.map((item) => item.id === comment.id ? { ...item, status } : item));
    showToast(status === 'approved' ? 'Comment approved and published.' : 'Comment returned to the review queue.', 'success');
  }

  async function deleteComment(comment) {
    if (!window.confirm(`Delete this comment on “${comment.postTitle}”? This cannot be undone.`)) return;
    await apiRequest(`/api/admin/comments/${comment.id}`, {
      method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken },
    });
    setComments((current) => current.filter((item) => item.id !== comment.id));
    showToast('Comment deleted.', 'success');
  }

  async function updateOwnPassword(passwords) {
    const result = await apiRequest('/api/admin/account/password', {
      method: 'PATCH', headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify(passwords),
    });
    showToast('Your password has been updated.', 'success');
    return result;
  }

  async function createUser(user) {
    const result = await apiRequest('/api/admin/users', {
      method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify(user),
    });
    setUsers((current) => [...current, result.user]);
  }

  async function updateUser(id, changes) {
    await apiRequest(`/api/admin/users/${id}`, {
      method: 'PATCH', headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify(changes),
    });
    setUsers((current) => current.map((user) => user.id === id ? { ...user, ...changes, password: undefined } : user));
  }

  async function deleteUser(user) {
    if (!window.confirm(`Delete the account “${user.username}”? This cannot be undone.`)) return;
    await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken } });
    setUsers((current) => current.filter((item) => item.id !== user.id));
  }

  async function deletePost(post) {
    if (!window.confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    setError('');
    try {
      await apiRequest(`/api/admin/posts/${post.id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      setPosts((current) => current.filter((item) => item.id !== post.id));
      if (editing?.id === post.id) setEditing(null);
      showToast('Article deleted.', 'success');
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    }
  }

  async function logout() {
    try {
      await apiRequest('/api/admin/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      setAdmin(null);
      setCsrfToken('');
      showToast('You have signed out.', 'success');
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    }
  }

  if (checking) return <LoadingSpinner message="Opening the school office…" />;
  if (!admin) return <Login notice={authError} onLogin={(session) => { setAuthError(''); setAdmin(session.admin); setCsrfToken(session.csrfToken); }} />;

  const needsReview = admissions.filter((item) => item.status === 'new' || item.status === 'reviewing').length;
  const publishedPosts = posts.filter((post) => post.published).length;
  const draftPosts = posts.length - publishedPosts;

  const tabTitles = {
    admissions: ['ADMISSIONS', 'Admission applications'],
    posts: ['NEWS & UPDATES', 'News, updates & events'],
    events: ['EVENTS', 'School events'],
    staff: ['STAFF', 'School team'],
    media: ['MEDIA', 'Media library & gallery'],
    account: ['MY ACCOUNT', 'Account security'],
    users: ['USER MANAGEMENT', 'Administrator accounts'],
    settings: ['SETTINGS', 'School & system settings'],
    messages: ['MESSAGES', 'Contact messages'],
    comments: ['COMMENTS', 'Article comments'],
  };

  return <main className="gv-admin" data-theme={darkMode ? 'dark' : 'light'}>
    <div className="gv-admin-layout">
      <aside className="gv-admin-sidebar">
        <a className="gv-admin-brand" href="#/home"><span>✳</span><span><strong>Golden Valley</strong><small>SCHOOL OFFICE</small></span></a>
        <p className="gv-admin-nav-label">WORKSPACE</p>
        <nav className="gv-admin-sidebar-nav" aria-label="Admin sections">
          {[
            ['admissions', '▤', 'Admissions', admissions.length],
            ['messages', '✉', 'Messages', messages.filter((message) => message.status === 'new').length],
            ['comments', '☷', 'Comments', comments.filter((comment) => comment.status === 'pending').length],
            ['posts', '✎', 'News & updates', posts.filter((post) => post.type !== 'event').length],
            ['events', '◷', 'Events', posts.filter((post) => post.type === 'event').length],
            ['staff', '♙', 'School staff', staff.length],
            ['media', '▧', 'Media library', media.length],
            ['account', '⚿', 'My account', null],
            ...(admin.role === 'superadmin' ? [['users', '♙', 'User management', users.length], ['settings', '⚙', 'Settings', null]] : []),
          ].map(([id, icon, label, count]) => <button type="button" key={id} className={tab === id ? 'is-active' : ''} onClick={() => { setTab(id); setEditing(null); setError(''); }}><span aria-hidden="true">{icon}</span>{label}{count !== null && <i>{count}</i>}</button>)}
        </nav>
        <div className="gv-admin-sidebar-bottom">
          <a className="gv-admin-site-link" href="#/home"><span aria-hidden="true">↗</span> View school website</a>
          <div className="gv-admin-user"><span className="gv-admin-user-avatar">{admin.username.slice(0, 1).toUpperCase()}</span><span><strong>{admin.username}</strong><small>{admin.role === 'superadmin' ? 'Super administrator' : 'Administrator'}</small></span><button type="button" onClick={logout} aria-label="Sign out" title="Sign out"><span aria-hidden="true">↪</span><span>Sign out</span></button></div>
        </div>
      </aside>
      <div className="gv-admin-main">
        <header className="gv-admin-header"><div><p className="gv-eyebrow">SCHOOL OFFICE <span>/</span> {tabTitles[tab][0]}</p><h1>{schoolGreeting(currentTime)}, <em>{admin.username}.</em></h1></div><div className="gv-admin-header-tools"><button type="button" className="gv-admin-theme-toggle" onClick={() => setDarkMode((value) => !value)}>{darkMode ? '☀ Light mode' : '☾ Dark mode'}</button><span className="gv-admin-header-date">{formatDate(currentTime.toISOString())}</span></div></header>
        <p className="gv-admin-lede">Here’s what’s happening at Golden Valley today.</p>
        <section className="gv-admin-stats" aria-label="School office overview">
          <article><span className="gv-admin-stat-icon is-green">▤</span><span><small>TOTAL APPLICATIONS</small><strong>{admissions.length}</strong></span></article>
          <article><span className="gv-admin-stat-icon is-yellow">◷</span><span><small>NEEDS FOLLOW-UP</small><strong>{needsReview}</strong></span></article>
          <article><span className="gv-admin-stat-icon is-teal">✎</span><span><small>PUBLISHED POSTS</small><strong>{publishedPosts}</strong></span></article>
          <article><span className="gv-admin-stat-icon is-coral">◌</span><span><small>DRAFTS</small><strong>{draftPosts}</strong></span></article>
        </section>
        <section className="gv-admin-workspace">
          <div className="gv-admin-workspace-heading"><div><p className="gv-eyebrow">{tab === 'admissions' || tab === 'messages' ? 'FAMILY ENQUIRIES' : 'PUBLIC WEBSITE'}</p><h2>{tabTitles[tab][1]}</h2><p>{tab === 'admissions' ? 'Review applications and keep track of each family’s next step.' : tab === 'messages' ? 'Read contact-form messages and reply to families by email.' : 'Manage the content and information families see on the school website.'}</p>          </div>{tab === 'messages' ? <button className="gv-admin-quiet" type="button" onClick={() => refreshMessages(true)}>Refresh inbox ↻</button> : (tab === 'posts' || tab === 'events') && !editing && <button className="gv-button" type="button" onClick={() => { setError(''); setEditing({ ...emptyPost, type: tab === 'events' ? 'event' : 'news' }); }}>Create {tab === 'events' ? 'event' : 'article'} <span aria-hidden="true">↗</span></button>}</div>
          {error && <p className="gv-admin-error gv-admin-page-error" role="alert">{error}</p>}
          {tab === 'messages' && messageError && <p className="gv-admin-error gv-admin-page-error" role="alert">{messageError}</p>}
          {loading ? <LoadingSpinner message="Loading the school office…" /> :
            tab === 'admissions' ? <AdmissionList admissions={admissions} onStatusChange={updateStatus} onViewResults={viewPreviousResults} />
              : tab === 'messages' ? <MessageManager messages={messages} onMarkRead={markMessageRead} onReply={replyToMessage} onDelete={deleteMessage} />
                : tab === 'comments' ? <CommentManager comments={comments} onUpdate={updateComment} onDelete={deleteComment} />
              : (tab === 'posts' || tab === 'events') ? (editing
                ? <PostEditor post={editing} onSave={savePost} onCancel={() => { setEditing(null); setError(''); }} busy={saving} error={error} csrfToken={csrfToken} media={media} onUploadImage={uploadContentImage} />
                : <PostList posts={posts.filter((post) => tab === 'events' ? post.type === 'event' : post.type !== 'event')} onNew={() => { setError(''); setEditing({ ...emptyPost, type: tab === 'events' ? 'event' : 'news' }); }} onEdit={(post) => { setError(''); setEditing({ ...emptyPost, ...post, published: Boolean(post.published) }); }} onDelete={deletePost} />)
                : tab === 'staff' ? <StaffManager staff={staff} media={media} onSave={saveStaff} onDelete={deleteStaff} onUploadImage={uploadContentImage} />
                  : tab === 'media' ? <MediaManager media={media} onUpload={uploadMedia} onUpdate={updateMedia} onDelete={deleteMedia} />
                    : tab === 'account' ? <AccountSettings username={admin.username} onSave={updateOwnPassword} />
                    : tab === 'users' && admin.role === 'superadmin' ? <UserManager users={users} currentAdminId={admin.id} onCreate={createUser} onUpdate={updateUser} onDelete={deleteUser} />
                      : tab === 'settings' && admin.role === 'superadmin' ? <SettingsManager settings={settings} media={media} onSave={saveSettings} onUploadIcon={uploadSiteIcon} onUploadImage={uploadContentImage} />
                        : <p className="gv-admin-empty">This section is not available to your account.</p>}
        </section>
        <p className="gv-admin-privacy">Applicant details are private and visible only to signed-in school administrators.</p>
      </div>
    </div>
  </main>;
}

function AdmissionList({ admissions, onStatusChange, onViewResults }) {
  if (!admissions.length) return <div className="gv-admin-empty"><span>✳</span><h2>No applications just yet.</h2><p>New online applications will appear here when families submit the form.</p></div>;
  return <div className="gv-admin-table-wrap"><table className="gv-admin-table"><thead><tr><th>Applicant</th><th>Class</th><th>Parent / guardian</th><th>Contact</th><th>Previous results</th><th>Received</th><th>Status</th></tr></thead><tbody>
    {admissions.map((application) => <tr key={application.id}><td><strong>{application.studentName}</strong><small>{application.reference} · born {formatDate(application.dateOfBirth)}</small></td><td>{classLabels[application.classApplied] || application.classApplied}</td><td>{application.parentName}<small>{application.relationship}</small></td><td><a href={`tel:${application.phone}`}>{application.phone}</a>{application.email && <small>{application.email}</small>}</td><td>{application.hasPreviousResults ? <a href={`/api/admin/admissions/${application.id}/results`} onClick={(event) => { event.preventDefault(); onViewResults(application.id); }}>{application.previousResultsName || 'View file'} ↗</a> : '—'}</td><td>{formatDate(application.createdAt)}</td><td><select className={`gv-admin-status is-${application.status}`} aria-label={`Application status for ${application.studentName}`} value={application.status} onChange={(event) => onStatusChange(application.id, event.target.value)}>{admissionStatuses.map((status) => <option value={status} key={status}>{status.replace('_', ' ')}</option>)}</select></td></tr>)}
  </tbody></table></div>;
}

function MessageManager({ messages, onMarkRead, onReply, onDelete }) {
  const [selectedId, setSelectedId] = useState(null);
  const [replies, setReplies] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const selected = messages.find((message) => message.id === selectedId) || messages[0];

  useEffect(() => {
    if (selectedId || !messages.length || messages[0].status !== 'new') return;
    onMarkRead(messages[0].id).catch((requestError) => setError(requestError.message));
  }, [messages, onMarkRead, selectedId]);

  async function openMessage(message) {
    setSelectedId(message.id);
    setSent(false);
    setError('');
    if (message.status === 'new') {
      try {
        await onMarkRead(message.id);
      } catch (requestError) {
        setError(requestError.message);
      }
    }
  }

  async function submitReply(event) {
    event.preventDefault();
    if (!selected) return;
    setError('');
    setSent(false);
    setBusy(true);
    try {
      await onReply(selected.id, replies[selected.id] || '');
      setReplies((current) => ({ ...current, [selected.id]: '' }));
      setSent(true);
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!messages.length) return <div className="gv-admin-empty"><span>✉</span><h2>Your inbox is clear.</h2><p>Contact form messages from families will appear here. Replies are sent directly by email.</p></div>;

  return <div className="gv-admin-inbox">
    <nav className="gv-admin-inbox-list" aria-label="Contact messages">
      {messages.map((message) => <button className={`gv-admin-inbox-item${selected?.id === message.id ? ' is-selected' : ''}${message.status === 'new' ? ' is-unread' : ''}`} type="button" key={message.id} onClick={() => openMessage(message)}>
        <span className="gv-admin-inbox-item-top"><strong>{message.name}</strong><small>{formatDate(message.createdAt)}</small></span>
        <span className="gv-admin-inbox-item-subject">{message.subject}</span>
        <span className={`gv-admin-message-status is-${message.status}`}>{message.status === 'new' ? 'New' : message.status === 'replied' ? 'Replied' : 'Read'}</span>
      </button>)}
    </nav>
    {selected && <article className="gv-admin-message-detail">
      <header><div><p className="gv-eyebrow">{selected.status === 'new' ? 'NEW MESSAGE' : selected.status === 'replied' ? 'REPLIED' : 'CONTACT MESSAGE'}</p><h3>{selected.subject}</h3></div><button type="button" className="gv-admin-delete-link" onClick={() => onDelete(selected).catch((requestError) => { setError(requestError.message); showToast(requestError.message, 'error'); })}>Delete</button></header>
      <div className="gv-admin-message-sender"><strong>{selected.name}</strong><a href={`mailto:${selected.email}`}>{selected.email}</a><small>Received {formatDate(selected.createdAt)}</small></div>
      <p className="gv-admin-message-body">{selected.message}</p>
      {selected.status === 'replied' && <div className="gv-admin-message-sent"><strong>Your last reply</strong><p>{selected.replyText}</p></div>}
      <form className="gv-admin-message-reply" onSubmit={submitReply}>
        <label htmlFor="gv-message-reply">Reply to sender</label>
        <textarea id="gv-message-reply" required maxLength="5000" rows="6" value={replies[selected.id] || ''} onChange={(event) => setReplies((current) => ({ ...current, [selected.id]: event.target.value }))} placeholder="Write your email reply…" />
        <p>Your reply will be emailed to {selected.email}.</p>
        {error && <p className="gv-admin-error" role="alert">{error}</p>}
        {sent && <p className="gv-admin-success-note" role="status">Email reply sent successfully.</p>}
        <button type="submit" className="gv-button" disabled={busy || !(replies[selected.id] || '').trim()}>{busy ? 'Sending email…' : 'Send email reply'} <span aria-hidden="true">↗</span></button>
      </form>
    </article>}
  </div>;
}

function CommentManager({ comments, onUpdate, onDelete }) {
  if (!comments.length) return <div className="gv-admin-empty"><span>☷</span><h2>No article comments yet.</h2><p>Comments submitted by readers will appear here for review before publication.</p></div>;
  return <div className="gv-admin-comment-list">
    <p className="gv-admin-comment-note">New comments stay private until an administrator approves them.</p>
    {comments.map((comment) => <article className="gv-admin-comment-card" key={comment.id}>
      <header><div><strong>{comment.name}</strong><span className={`gv-admin-message-status is-${comment.status}`}>{comment.status === 'pending' ? 'Awaiting review' : 'Published'}</span></div><time>{formatDate(comment.createdAt)}</time></header>
      <p>{comment.body}</p>
      <a href={`#/news/${comment.postSlug}`} target="_blank" rel="noreferrer">On: {comment.postTitle} ↗</a>
      <div className="gv-admin-post-actions">
        {comment.status === 'pending'
          ? <button type="button" onClick={() => onUpdate(comment, 'approved').catch((requestError) => showToast(requestError.message, 'error'))}>Approve &amp; publish</button>
          : <button type="button" onClick={() => onUpdate(comment, 'pending').catch((requestError) => showToast(requestError.message, 'error'))}>Hide from public</button>}
        <button type="button" className="gv-admin-delete" onClick={() => onDelete(comment).catch((requestError) => showToast(requestError.message, 'error'))}>Delete</button>
      </div>
    </article>)}
  </div>;
}

function PostList({ posts, onNew, onEdit, onDelete }) {
  return <section className="gv-admin-posts">
    <div className="gv-admin-section-heading"><div><h2>Your school stories</h2><p>Write and publish news, updates, and events on the public site.</p></div><button className="gv-button" type="button" onClick={onNew}>Write a post <span aria-hidden="true">↗</span></button></div>
    {!posts.length ? <div className="gv-admin-empty"><span>✳</span><h2>There are no posts yet.</h2><p>Create your first update for families and learners.</p></div> : <div className="gv-admin-post-list">{posts.map((post) => <article className="gv-admin-post-row" key={post.id}>
      <div><div className="gv-admin-post-meta"><span className="gv-pill">{post.type === 'update' ? 'SCHOOL UPDATE' : post.type.toUpperCase()}</span><span className={post.published ? 'gv-admin-published' : 'gv-admin-draft'}>{post.published ? 'Published' : 'Draft'}</span>{post.type === 'event' && <span>{formatDate(post.eventDate)} {post.eventTime}</span>}</div><h3>{post.title}</h3><p>{post.summary}</p>{post.published && <a href={`#/news/${post.slug}`} target="_blank" rel="noreferrer">Preview / share article ↗</a>}</div><div className="gv-admin-post-actions"><button type="button" onClick={() => onEdit(post)}>Edit</button><button type="button" className="gv-admin-delete" onClick={() => onDelete(post)}>Delete</button></div>
    </article>)}</div>}
  </section>;
}

function ImageUploadField({ label, value, onChange, onUploadImage, altText }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      onChange(await onUploadImage(file, altText));
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  return <div className="gv-admin-image-upload">
    <label>{label}<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={busy} onChange={upload} /></label>
    <small>JPG, PNG, GIF, or WebP · up to 4 MB. {busy ? 'Uploading image…' : value ? 'The new upload is now selected.' : 'Choose an image from your device.'}</small>
    {error && <p className="gv-admin-error" role="alert">{error}</p>}
  </div>;
}

function SiteIconField({ label, value, media, onChange, onUploadIcon }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      onChange(await onUploadIcon(file));
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  return <div className="gv-admin-site-icon-field">
    <label>{label}<select value={value || ''} onChange={(event) => onChange(event.target.value)}><option value="">Use the Golden Valley default</option>{media.map((item) => <option key={item.id} value={mediaUrl(item)}>{item.altText || item.originalName}</option>)}</select></label>
    <label>Or upload a PNG, GIF, or WebP icon<input type="file" accept="image/png,image/gif,image/webp" disabled={busy} onChange={upload} /></label>
    {value && <img src={value} alt={`${label} preview`} />}
    {busy && <small>Uploading icon…</small>}
    {error && <p className="gv-admin-error" role="alert">{error}</p>}
  </div>;
}

function SiteImageField({ label, fallbackName, value, media, onChange, onUploadImage }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      onChange(await onUploadImage(file));
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }
  return <div className="gv-admin-site-image-field">
    <label>{label}<select value={value || ''} onChange={(event) => onChange(event.target.value)}><option value="">Use default image ({fallbackName})</option>{media.map((item) => <option key={item.id} value={mediaUrl(item)}>{item.altText || item.originalName}</option>)}</select></label>
    <label>Or upload a replacement image<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={busy} onChange={upload} /></label>
    <small>Default: {fallbackName}. Upload or choose an image in the media library to replace it on the public site.</small>
    {value && <img src={value} alt={`${label} preview`} />}
    {busy && <small>Uploading image…</small>}
    {error && <p className="gv-admin-error" role="alert">{error}</p>}
  </div>;
}

const emptyStaff = { name: '', role: '', bio: '', image: '', leadership: false, displayOrder: 0, published: true };

function StaffManager({ staff, media, onSave, onDelete, onUploadImage }) {
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave(editing);
      setEditing(null);
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return <div className="gv-admin-management">
    <div className="gv-admin-section-heading"><div><h2>Meet the people who make school special</h2><p>Leadership profiles appear first. Other published staff are revealed on the public page.</p></div><button className="gv-button" type="button" onClick={() => { setError(''); setEditing({ ...emptyStaff }); }}>Add staff member</button></div>
    {editing && <form className="gv-admin-editor-form gv-admin-compact-form" onSubmit={submit}>
      <h3>{editing.id ? 'Edit staff profile' : 'New staff profile'}</h3>
      <label>Name<input required maxLength="120" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
      <label>Position / title<input required maxLength="120" value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value })} /></label>
      <label>Short biography<textarea rows="3" maxLength="1000" value={editing.bio} onChange={(event) => setEditing({ ...editing, bio: event.target.value })} /></label>
      <label>Profile image from media library<select value={editing.image} onChange={(event) => setEditing({ ...editing, image: event.target.value })}><option value="">Initials only</option>{media.map((item) => <option key={item.id} value={mediaUrl(item)}>{item.altText || item.originalName}</option>)}</select></label>
      <ImageUploadField label="Or upload a profile image" value={editing.image} onChange={(image) => setEditing({ ...editing, image })} onUploadImage={onUploadImage} altText={editing.name} />
      <div className="gv-admin-inline-fields"><label>Display order<input type="number" min="0" value={editing.displayOrder} onChange={(event) => setEditing({ ...editing, displayOrder: Number(event.target.value) })} /></label><label className="gv-admin-check"><input type="checkbox" checked={Boolean(editing.leadership)} onChange={(event) => setEditing({ ...editing, leadership: event.target.checked })} /> School leadership (show first)</label><label className="gv-admin-check"><input type="checkbox" checked={Boolean(editing.published)} onChange={(event) => setEditing({ ...editing, published: event.target.checked })} /> Visible on school website</label></div>
      {error && <p className="gv-admin-error" role="alert">{error}</p>}
      <div className="gv-admin-editor-actions"><button className="gv-button" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button><button className="gv-admin-quiet" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
    {!staff.length ? <div className="gv-admin-empty"><h2>No staff profiles yet.</h2><p>Add the school’s top management and staff team.</p></div> : <div className="gv-admin-record-list">{staff.map((person) => <article key={person.id} className="gv-admin-record">
      {person.image ? <img src={person.image} alt="" /> : <span className="gv-admin-record-avatar">{person.name.slice(0, 1).toUpperCase()}</span>}
      <div><h3>{person.name} {person.leadership ? <span className="gv-pill">LEADERSHIP</span> : null}</h3><p>{person.role}</p><small>{person.published ? 'Published' : 'Hidden'} · Order {person.displayOrder}</small></div>
      <div className="gv-admin-post-actions"><button type="button" onClick={() => { setError(''); setEditing({ ...person, leadership: Boolean(person.leadership), published: Boolean(person.published) }); }}>Edit</button><button className="gv-admin-delete" type="button" onClick={() => onDelete(person).catch((requestError) => { setError(requestError.message); showToast(requestError.message, 'error'); })}>Remove</button></div>
    </article>)}</div>}
    {error && !editing && <p className="gv-admin-error" role="alert">{error}</p>}
  </div>;
}

function MediaManager({ media, onUpload, onUpdate, onDelete }) {
  const [file, setFile] = useState(null);
  const [altText, setAltText] = useState('');
  const [descriptions, setDescriptions] = useState({});
  const [galleryVisible, setGalleryVisible] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await onUpload(file, altText, galleryVisible);
      setFile(null);
      setAltText('');
      formElement.reset();
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return <div className="gv-admin-management">
    <form className="gv-admin-upload" onSubmit={submit}>
      <h2>Add images to your media library</h2>
      <p>JPG, PNG, GIF, or WebP · up to 4 MB. Images marked for the gallery appear on the public website.</p>
      <label>Image file<input required type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      <label>Image description / alt text<input maxLength="300" value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="Describe this image for accessibility" /></label>
      <label className="gv-admin-check"><input type="checkbox" checked={galleryVisible} onChange={(event) => setGalleryVisible(event.target.checked)} /> Display in public school gallery</label>
      {error && <p className="gv-admin-error" role="alert">{error}</p>}
      <button className="gv-button" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload image'}</button>
    </form>
    {!media.length ? <div className="gv-admin-empty"><h2>Your media library is empty.</h2><p>Upload school photos to use them in news, events, staff profiles, and site settings.</p></div> : <div className="gv-admin-media-grid">{media.map((item) => <article key={item.id} className="gv-admin-media-card">
      <img src={mediaUrl(item)} alt={item.altText || item.originalName} />
      <div><strong>{item.originalName}</strong><small>{Math.max(1, Math.round(item.size / 1024))} KB</small>
        <form className="gv-admin-media-description" onSubmit={(event) => { event.preventDefault(); onUpdate(item, { altText: descriptions[item.id] ?? item.altText ?? '', galleryVisible: Boolean(item.galleryVisible) }).catch((requestError) => { setError(requestError.message); showToast(requestError.message, 'error'); }); }}>
          <label>Image description<input maxLength="300" value={descriptions[item.id] ?? item.altText ?? ''} onChange={(event) => setDescriptions({ ...descriptions, [item.id]: event.target.value })} /></label>
          <button type="submit" disabled={(descriptions[item.id] ?? item.altText ?? '') === (item.altText || '')}>Save description</button>
        </form>
        <label className="gv-admin-check"><input type="checkbox" checked={Boolean(item.galleryVisible)} onChange={(event) => onUpdate(item, { altText: descriptions[item.id] ?? item.altText ?? '', galleryVisible: event.target.checked }).catch((requestError) => { setError(requestError.message); showToast(requestError.message, 'error'); })} /> Show in gallery</label><button type="button" className="gv-admin-delete-link" onClick={() => onDelete(item).catch((requestError) => { setError(requestError.message); showToast(requestError.message, 'error'); })}>Delete image</button></div>
    </article>)}</div>}
    {error && <p className="gv-admin-error" role="alert">{error}</p>}
  </div>;
}

function UserManager({ users, currentAdminId, onCreate, onUpdate, onDelete }) {
  const [draft, setDraft] = useState({ username: '', password: '', role: 'admin' });
  const [passwords, setPasswords] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      await onCreate(draft);
      setDraft({ username: '', password: '', role: 'admin' });
      formElement.reset();
      showToast('Administrator account created.', 'success');
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword(id) {
    setError('');
    try {
      await onUpdate(id, { password: passwords[id] });
      setPasswords((current) => ({ ...current, [id]: '' }));
      showToast('Administrator password reset.', 'success');
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    }
  }
  async function updateRole(user, role) {
    setError('');
    try {
      await onUpdate(user.id, { role });
      showToast(`Access role updated for ${user.username}.`, 'success');
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    }
  }
  async function removeUser(user) {
    setError('');
    try {
      await onDelete(user);
      showToast(`Administrator account ${user.username} deleted.`, 'success');
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    }
  }
  return <div className="gv-admin-management">
    {error && <p className="gv-admin-error" role="alert">{error}</p>}
    <form className="gv-admin-upload gv-admin-user-create" onSubmit={submit}>
      <div className="gv-admin-upload-heading"><p className="gv-eyebrow">ACCESS CONTROL</p><h2>Create an administrator</h2><p>Add a trusted staff member and choose their access level. Use a unique username and a strong password with at least 14 characters.</p></div>
      <div className="gv-admin-user-create-fields"><label>Username<input required minLength="3" maxLength="80" autoComplete="username" value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} /></label><label>Temporary password<input required type="password" minLength="14" maxLength="200" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /></label><label>Access role<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}><option value="admin">Administrator</option><option value="superadmin">Super administrator</option></select></label></div>
      <button className="gv-button" disabled={busy}>{busy ? 'Creating…' : 'Create account'} <span aria-hidden="true">↗</span></button>
    </form>
    <section className="gv-admin-user-list" aria-label="Administrator accounts">
      <header><div><p className="gv-eyebrow">CURRENT ACCESS</p><h3>Administrator accounts</h3></div><span>{users.length} {users.length === 1 ? 'account' : 'accounts'}</span></header>
      {!users.length ? <div className="gv-admin-empty"><h2>No administrator accounts found.</h2><p>Create an account above to give staff access to the school office.</p></div> : users.map((user) => <article key={user.id} className="gv-admin-user-card">
        <div className="gv-admin-record-avatar">{user.username.slice(0, 1).toUpperCase()}</div>
        <div className="gv-admin-user-card-heading"><h4>{user.username}{user.id === currentAdminId ? <span>YOU</span> : null}</h4><p>{user.role === 'superadmin' ? 'Super administrator' : 'Administrator'} · Added {formatDate(user.createdAt)}</p></div>
        <div className="gv-admin-user-card-actions">
          <label>Access role<select aria-label={`Role for ${user.username}`} value={user.role} disabled={user.id === currentAdminId} onChange={(event) => updateRole(user, event.target.value)}><option value="admin">Administrator</option><option value="superadmin">Super administrator</option></select></label>
          <form className="gv-admin-user-password" onSubmit={(event) => { event.preventDefault(); resetPassword(user.id); }}><label>Set a new password<input type="password" minLength="14" maxLength="200" autoComplete="new-password" aria-label={`New password for ${user.username}`} placeholder="At least 14 characters" value={passwords[user.id] || ''} onChange={(event) => setPasswords({ ...passwords, [user.id]: event.target.value })} /></label><button type="submit" disabled={(passwords[user.id] || '').length < 14}>Reset password</button></form>
        </div>
        <button type="button" className="gv-admin-delete-link gv-admin-user-delete" onClick={() => removeUser(user)} disabled={user.id === currentAdminId}>Delete account</button>
      </article>)}
    </section>
  </div>;
}

function SettingsManager({ settings, media, onSave, onUploadIcon, onUploadImage }) {
  const [draft, setDraft] = useState({
    schoolName: '', tagline: '', phone: '', email: '', whatsappNumber: '', applicationsOpen: true,
    siteColors: DEFAULT_SITE_COLORS, savedColorPalettes: DEFAULT_COLOR_PALETTES,
    whatsappWelcomeMessage: DEFAULT_WHATSAPP_WELCOME_MESSAGE,
    whatsappContactTemplate: DEFAULT_WHATSAPP_CONTACT_TEMPLATE,
    ...settings,
    siteImages: { ...DEFAULT_SITE_IMAGES, ...settings.siteImages },
  });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [paletteName, setPaletteName] = useState('');
  const [paletteToApply, setPaletteToApply] = useState('');
  useEffect(() => {
    setDraft({
      schoolName: '', tagline: '', phone: '', email: '', whatsappNumber: '', applicationsOpen: true,
      siteColors: { ...DEFAULT_SITE_COLORS, ...settings.siteColors },
      savedColorPalettes: settings.savedColorPalettes || DEFAULT_COLOR_PALETTES,
      whatsappWelcomeMessage: DEFAULT_WHATSAPP_WELCOME_MESSAGE,
      whatsappContactTemplate: DEFAULT_WHATSAPP_CONTACT_TEMPLATE,
      ...settings,
      siteImages: { ...DEFAULT_SITE_IMAGES, ...settings.siteImages },
    });
  }, [settings]);

  function updateColor(role, value) {
    setDraft((current) => ({ ...current, siteColors: { ...current.siteColors, [role]: value } }));
  }

  function savePalette() {
    const name = paletteName.trim();
    if (!name) {
      setError('Give this color palette a name before saving it.');
      return;
    }
    if (draft.savedColorPalettes.some((palette) => palette.name.toLowerCase() === name.toLowerCase())) {
      setError('A saved palette already uses that name. Choose a different name.');
      return;
    }
    setError('');
    setDraft((current) => ({
      ...current,
      savedColorPalettes: [...current.savedColorPalettes, { name, colors: { ...current.siteColors } }],
    }));
    setPaletteName('');
  }

  function applyPalette() {
    const palette = draft.savedColorPalettes.find((item) => item.name === paletteToApply);
    if (palette) setDraft((current) => ({ ...current, siteColors: { ...palette.colors } }));
  }

  function deletePalette() {
    if (!paletteToApply || paletteToApply === DEFAULT_COLOR_PALETTES[0].name) return;
    setDraft((current) => ({
      ...current,
      savedColorPalettes: current.savedColorPalettes.filter((palette) => palette.name !== paletteToApply),
    }));
    setPaletteToApply('');
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaved(false);
    try {
      await onSave(draft);
      setSaved(true);
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    }
  }
  return <form className="gv-admin-settings-form gv-admin-settings-page" onSubmit={submit}>
    <header className="gv-admin-settings-intro"><p className="gv-eyebrow">SCHOOL CONFIGURATION</p><h2>Settings, all in one place</h2><p>Update the school’s public identity, appearance, and family contact options.</p></header>
    <div className="gv-admin-settings-grid">
    <section className="gv-admin-settings-group gv-admin-settings-school">
      <h2>School information</h2><p>These details are shown on public pages and used by the admissions form.</p>
      <label>School name<input required maxLength="120" value={draft.schoolName} onChange={(event) => setDraft({ ...draft, schoolName: event.target.value })} /></label>
      <label>Tagline<input required maxLength="160" value={draft.tagline} onChange={(event) => setDraft({ ...draft, tagline: event.target.value })} /></label>
      <div className="gv-admin-inline-fields"><label>School phone<input required value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label><label>School email<input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label><label>WhatsApp number <span>(country code, digits only)</span><input required pattern="[0-9]{8,20}" value={draft.whatsappNumber} onChange={(event) => setDraft({ ...draft, whatsappNumber: event.target.value })} /></label></div>
      <label className="gv-admin-check"><input type="checkbox" checked={Boolean(draft.applicationsOpen)} onChange={(event) => setDraft({ ...draft, applicationsOpen: event.target.checked })} /> Accept new online applications</label>
    </section>

    <section className="gv-admin-settings-group gv-admin-settings-icons">
      <h2>Site icons</h2>
      <p>Choose a small square PNG or WebP image for browser tabs and a 180 × 180 pixel icon for saved home-screen shortcuts.</p>
      <SiteIconField label="Browser tab icon (favicon)" value={draft.faviconUrl} media={media} onChange={(faviconUrl) => setDraft({ ...draft, faviconUrl })} onUploadIcon={onUploadIcon} />
      <SiteIconField label="Apple home-screen icon" value={draft.appleTouchIconUrl} media={media} onChange={(appleTouchIconUrl) => setDraft({ ...draft, appleTouchIconUrl })} onUploadIcon={onUploadIcon} />
    </section>

    <section className="gv-admin-settings-group gv-admin-settings-images">
      <h2>Public site images</h2>
      <p>Replace the bundled school photos and logos used throughout the public website. Images in articles, staff profiles, and the gallery remain managed in their own sections.</p>
      <div className="gv-admin-site-images-grid">
        <SiteImageField label="Homepage classroom photo" fallbackName="hero-classroom.jpg" value={draft.siteImages.heroClassroom} media={media} onChange={(heroClassroom) => setDraft({ ...draft, siteImages: { ...draft.siteImages, heroClassroom } })} onUploadImage={onUploadImage} />
        <SiteImageField label="Homepage playground photo" fallbackName="hero-playground.jpg" value={draft.siteImages.heroPlayground} media={media} onChange={(heroPlayground) => setDraft({ ...draft, siteImages: { ...draft.siteImages, heroPlayground } })} onUploadImage={onUploadImage} />
        <SiteImageField label="Pupils and page-hero photo" fallbackName="hero-students-group.jpg" value={draft.siteImages.heroStudentsGroup} media={media} onChange={(heroStudentsGroup) => setDraft({ ...draft, siteImages: { ...draft.siteImages, heroStudentsGroup } })} onUploadImage={onUploadImage} />
        <SiteImageField label="About and academics photo" fallbackName="about-school.jpg" value={draft.siteImages.aboutSchool} media={media} onChange={(aboutSchool) => setDraft({ ...draft, siteImages: { ...draft.siteImages, aboutSchool } })} onUploadImage={onUploadImage} />
        <SiteImageField label="Header crest logo" fallbackName="logo-crest.png" value={draft.siteImages.logoCrest} media={media} onChange={(logoCrest) => setDraft({ ...draft, siteImages: { ...draft.siteImages, logoCrest } })} onUploadImage={onUploadImage} />
        <SiteImageField label="Footer logo" fallbackName="logo-full-white.png" value={draft.siteImages.logoFullWhite} media={media} onChange={(logoFullWhite) => setDraft({ ...draft, siteImages: { ...draft.siteImages, logoFullWhite } })} onUploadImage={onUploadImage} />
      </div>
    </section>

    <section className="gv-admin-settings-group gv-admin-settings-colors">
      <h2>Site colors</h2>
      <p>The Golden Valley default palette matches the current website. Primary sets the main buttons and brand elements; secondary sets button highlights; accent colors links and decorative details; surface tints section backgrounds. Choose colors below or apply a saved palette, then save settings to publish your changes.</p>
      <div className="gv-admin-color-grid">{[
        ['primary', 'Primary · main buttons'],
        ['secondary', 'Secondary · button highlights'],
        ['accent', 'Accent · links and details'],
        ['surface', 'Surface · soft backgrounds'],
      ].map(([role, label]) => <label className="gv-admin-color-control" key={role}>{label}<span><input type="color" value={draft.siteColors[role]} onChange={(event) => updateColor(role, event.target.value)} /><code>{draft.siteColors[role].toUpperCase()}</code></span></label>)}</div>
      <div className="gv-admin-palette-tools">
        <label>Saved palettes<select value={paletteToApply} onChange={(event) => setPaletteToApply(event.target.value)}><option value="">Choose a palette to apply</option>{draft.savedColorPalettes.map((palette) => <option key={palette.name} value={palette.name}>{palette.name}</option>)}</select></label>
        <button className="gv-admin-quiet" type="button" disabled={!paletteToApply} onClick={applyPalette}>Apply palette</button>
        <button className="gv-admin-quiet" type="button" disabled={!paletteToApply || paletteToApply === DEFAULT_COLOR_PALETTES[0].name} onClick={deletePalette}>Remove palette</button>
      </div>
      <div className="gv-admin-palette-tools">
        <label>Save current colors as a palette<input maxLength="40" value={paletteName} onChange={(event) => setPaletteName(event.target.value)} placeholder="e.g. School anniversary" /></label>
        <button className="gv-admin-quiet" type="button" onClick={savePalette}>Save palette</button>
        <button className="gv-admin-quiet" type="button" onClick={() => setDraft((current) => ({ ...current, siteColors: { ...DEFAULT_SITE_COLORS } }))}>Restore default colors</button>
      </div>
      <p className="gv-admin-settings-warning">After choosing or saving colors, select <strong>Save settings</strong> below. A saved palette is stored for reuse after you save these settings.</p>
    </section>

    <section className="gv-admin-settings-group gv-admin-settings-whatsapp">
      <h2>WhatsApp messages</h2>
      <p>These messages open in WhatsApp for the visitor to review and send. Keep them welcoming and avoid asking families to share sensitive information in chat.</p>
      <label>Welcome message<textarea required rows="3" maxLength="500" value={draft.whatsappWelcomeMessage} onChange={(event) => setDraft({ ...draft, whatsappWelcomeMessage: event.target.value })} /></label>
      <label>Contact form message template<textarea required rows="7" maxLength="1000" value={draft.whatsappContactTemplate} onChange={(event) => setDraft({ ...draft, whatsappContactTemplate: event.target.value })} /></label>
      <p className="gv-admin-settings-help">Use <code>{'{{name}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{subject}}'}</code>, and <code>{'{{message}}'}</code> in the contact template. Those placeholders are replaced with the visitor’s form details.</p>
    </section>
    </div>

    <p className="gv-admin-settings-warning">The TinyMCE API key is a public browser key. Restrict allowed domains in your TinyMCE account. Change it using <code>VITE_TINYMCE_API_KEY</code> in your local environment file, then rebuild.</p>
    {error && <p className="gv-admin-error" role="alert">{error}</p>}{saved && <p className="gv-admin-success-note" role="status">Settings saved.</p>}
    <button className="gv-button" type="submit">Save settings</button>
  </form>;
}

function AccountSettings({ username, onSave }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaved(false);
    if (form.newPassword !== form.confirmPassword) {
      setError('The new password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      await onSave({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSaved(true);
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return <form className="gv-admin-account-card" onSubmit={submit}>
    <header className="gv-admin-account-heading"><span aria-hidden="true">⚿</span><div><p className="gv-eyebrow">ACCOUNT SECURITY</p><h2>Change your password</h2><p>Signed in as <strong>{username}</strong>. Use a strong password that you do not reuse elsewhere.</p></div></header>
    <div className="gv-admin-account-fields">
    <label>Current password<input type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} /></label>
    <label>New password<input type="password" autoComplete="new-password" minLength="14" maxLength="200" required value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} /><span>Use at least 14 characters.</span></label>
    <label>Confirm new password<input type="password" autoComplete="new-password" minLength="14" maxLength="200" required value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} /></label>
    </div>
    {error && <p className="gv-admin-error" role="alert">{error}</p>}{saved && <p className="gv-admin-success-note" role="status">Your password has been updated.</p>}
    <button className="gv-button" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
  </form>;
}
