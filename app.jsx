import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import Admin from './Admin.jsx';
import { apiRequest, formatDate, mediaUrl, whatsappUrl } from './api.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import {
  DEFAULT_SITE_COLORS,
  DEFAULT_SITE_IMAGES,
  DEFAULT_WHATSAPP_CONTACT_TEMPLATE,
  DEFAULT_WHATSAPP_WELCOME_MESSAGE,
  siteColorVariables,
} from './site-theme.js';
import { showToast } from './notifications.js';
import './app.css';

const pages = [
  ['home', 'Home'],
  ['about', 'About'],
  ['academics', 'Academics'],
  ['admissions', 'Admissions'],
  ['gallery', 'Gallery'],
  ['news', 'News & Events'],
  ['staff', 'Our Team'],
  ['contact', 'Contact'],
];

const photo = (name) => {
  const base = '/images/';
  return `${base}${name}`;
};

function photosFor(siteImages = {}) {
  return [
    { src: siteImages.heroClassroom || photo('hero-classroom.jpg'), alt: 'Pupils learning together in class', label: 'Curious minds at work' },
    { src: siteImages.heroPlayground || photo('hero-playground.jpg'), alt: 'Children playing on the school playground', label: 'Room to play and grow' },
    { src: siteImages.heroStudentsGroup || photo('hero-students-group.jpg'), alt: 'Golden Valley pupils in their uniforms', label: 'Our school community' },
    { src: siteImages.aboutSchool || photo('about-school.jpg'), alt: 'Pupils spending time together in the school garden', label: 'Growing together' },
  ];
}

function Arrow() {
  return <span aria-hidden="true" className="gv-arrow">↗</span>;
}

function Link({ to, children, className = '', ...props }) {
  return <a href={`#/${to}`} className={className} {...props}>{children}</a>;
}

function ToastViewport({ colors, theme }) {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const receiveToast = (event) => {
      const toast = { ...event.detail, id: crypto.randomUUID() };
      setToasts((current) => [...current, toast]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 5000);
    };
    window.addEventListener('gv-toast', receiveToast);
    return () => window.removeEventListener('gv-toast', receiveToast);
  }, []);

  return <div className="gv-toast-viewport" data-theme={theme} style={siteColorVariables(colors, theme)} aria-live="polite" aria-relevant="additions">
    {toasts.map((toast) => <div className={`gv-toast is-${toast.type}`} key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'}>
      <span className="gv-toast-icon" aria-hidden="true">{toast.type === 'error' ? '!' : '✓'}</span>
      <p>{toast.message}</p>
      <button type="button" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>×</button>
    </div>)}
  </div>;
}

function Header({ active, menuOpen, setMenuOpen, theme, onThemeToggle }) {
  const settings = useSiteSettings();
  return <>
    <div className="gv-topline">
      <div className="gv-wrap gv-topline-inner">
        <span><span className="gv-live-dot" /> Enrolment enquiries are welcome</span>
        <a href={whatsappUrl(settings.whatsappWelcomeMessage, settings.whatsappNumber)} target="_blank" rel="noreferrer">WhatsApp us <b>{settings.phone}</b></a>
      </div>
    </div>
    <header className="gv-header">
      <div className="gv-wrap gv-header-inner">
        <Link to="home" className="gv-brand" aria-label="Golden Valley home">
          <img src={settings.siteImages?.logoCrest || photo('logo-crest.png')} alt="" />
          <span><strong>{settings.schoolName.replace(/\s+School$/i, '')}</strong><small>{settings.tagline.toUpperCase()}</small></span>
        </Link>
        <button className="gv-menu-toggle" type="button" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(!menuOpen)}>
          <span /><span />
        </button>
        <nav className={menuOpen ? 'gv-nav is-open' : 'gv-nav'} aria-label="Main navigation">
          {pages.slice(0, 8).map(([id, label]) =>
            <Link key={id} to={id} className={active === id ? 'is-active' : ''} onClick={() => setMenuOpen(false)}>{label}</Link>
          )}
          <Link to="admissions" className="gv-nav-cta" onClick={() => setMenuOpen(false)}>Join our school <Arrow /></Link>
        </nav>
        <button className="gv-theme-toggle" type="button" onClick={onThemeToggle} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? '☾' : '☀'} <span>{theme === 'light' ? 'Dark' : 'Light'}</span></button>
      </div>
    </header>
  </>;
}

function Button({ to, children, secondary = false, ...props }) {
  return <Link to={to} className={`gv-button${secondary ? ' gv-button-secondary' : ''}`} {...props}>{children}<Arrow /></Link>;
}

function SectionHeading({ eyebrow, title, text, light = false }) {
  return <div className={`gv-section-heading${light ? ' is-light' : ''}`}>
    {eyebrow && <p className="gv-eyebrow">{eyebrow}</p>}
    <h2>{title}</h2>
    {text && <p className="gv-section-intro">{text}</p>}
  </div>;
}

function usePosts(type, limit = 30) {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ limit: String(limit) });
    if (type) query.set('type', type);
    apiRequest(`/api/posts?${query}`)
      .then((result) => { if (!cancelled) setPosts(result.posts); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); });
    return () => { cancelled = true; };
  }, [type, limit]);

  return { posts, error };
}

function useSiteSettings() {
  const [settings, setSettings] = useState({
    schoolName: 'Golden Valley School',
    tagline: 'Kindergarten · Day Care · Primary',
    phone: '0777 627 421',
    email: 'goldenvalleyschool190@gmail.com',
    whatsappNumber: '256777627421',
    applicationsOpen: true,
    faviconUrl: '',
    appleTouchIconUrl: '',
    siteImages: DEFAULT_SITE_IMAGES,
    siteColors: DEFAULT_SITE_COLORS,
    whatsappWelcomeMessage: DEFAULT_WHATSAPP_WELCOME_MESSAGE,
    whatsappContactTemplate: DEFAULT_WHATSAPP_CONTACT_TEMPLATE,
  });
  useEffect(() => {
    let cancelled = false;
    const updateSettings = (event) => {
      setSettings((current) => ({ ...current, ...event.detail }));
    };
    window.addEventListener('gv-site-settings-updated', updateSettings);
    apiRequest('/api/site-settings')
      .then((result) => { if (!cancelled) setSettings((current) => ({ ...current, ...result })); })
      .catch((error) => console.error('Unable to load school contact settings.', error));
    return () => {
      cancelled = true;
      window.removeEventListener('gv-site-settings-updated', updateSettings);
    };
  }, []);
  return settings;
}

function Home() {
  const settings = useSiteSettings();
  const photos = photosFor(settings.siteImages);
  const { posts: events, error: eventsError } = usePosts('event', 2);
  const { posts: articles, error: articlesError } = usePosts('news', 2);

  return <>
    <section className="gv-hero">
      <div className="gv-wrap gv-hero-grid">
        <div className="gv-hero-copy">
          <p className="gv-eyebrow"><span className="gv-sparkle">✳</span> A bright beginning in Arua City</p>
          <h1>Little steps.<br /><em>Big futures.</em></h1>
          <p className="gv-hero-lede">A caring place to learn, play, and grow. At Golden Valley, every child is known by name and encouraged to discover what they can do.</p>
          <div className="gv-actions">
            <Button to="admissions">Start your journey</Button>
            <Button to="about" secondary>Discover Golden Valley</Button>
          </div>
          <div className="gv-hero-proof"><div className="gv-mini-avatars" aria-hidden="true"><i>G</i><i>V</i><i>♡</i></div><p><strong>A community that cares</strong><br />Learning with kindness, every day.</p></div>
        </div>
        <div className="gv-hero-art">
          <div className="gv-photo-main"><img src={photos[0].src} alt={photos[0].alt} /></div>
          <div className="gv-photo-float"><img src={photos[2].src} alt={photos[2].alt} /><span>Growing together <b>✳</b></span></div>
          <div className="gv-hero-sticker"><span>Learn</span><b>✳</b><span>Play</span><b>✳</b><span>Grow</span></div>
          <span className="gv-art-sun" aria-hidden="true">✳</span>
        </div>
      </div>
      <div className="gv-hero-bottom"><span>EWUATA, ARUA CITY</span><span>MADE FOR LITTLE LEARNERS <b>↓</b></span></div>
    </section>

    <section className="gv-welcome gv-section">
      <div className="gv-wrap gv-welcome-grid">
        <div><p className="gv-eyebrow">A place to belong</p><h2>Every child has a spark.<br /><em>We help it shine.</em></h2></div>
        <div><p>From the first classroom hello to proud primary milestones, we make space for children to feel safe, make friends, ask questions, and find joy in learning.</p><Link to="academics" className="gv-text-link">See how we learn <Arrow /></Link></div>
      </div>
    </section>

    <section className="gv-why gv-section">
      <div className="gv-wrap">
        <SectionHeading eyebrow="The Golden Valley difference" title={<>Good things grow <em>here.</em></>} text="A thoughtful start to a lifetime of learning." />
        <div className="gv-benefit-grid">
          {[
            ['01', 'Teachers who care', 'Warm, attentive educators help every child feel seen, supported, and ready to try.'],
            ['02', 'Learn by doing', 'Stories, play, and hands-on discovery help new ideas stick and imaginations grow.'],
            ['03', 'A safe place to grow', 'A caring school community gives children room to build confidence and friendships.'],
            ['04', 'Growing minds, nourished', 'Breakfast and lunch help keep little learners ready for the day.'],
            ['05', 'More than the classroom', 'Play and study tours make learning an adventure that reaches beyond the classroom.'],
            ['06', 'Character for life', 'Kindness, integrity, and responsibility are part of what we learn together.'],
          ].map(([number, title, text], index) => <article className={`gv-benefit gv-benefit-${index + 1}`} key={number}>
            <span className="gv-benefit-number">{number}</span><span className="gv-benefit-icon" aria-hidden="true">{['✳', '✎', '♡', '☼', '↗', '✿'][index]}</span>
            <h3>{title}</h3><p>{text}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section className="gv-programs gv-section">
      <div className="gv-wrap gv-program-grid">
        <div className="gv-program-image"><img src={photos[3].src} alt={photos[3].alt} /><span className="gv-image-label">Little learners, big discoveries</span></div>
        <div className="gv-program-copy">
          <p className="gv-eyebrow">Room to find your feet</p><h2>Every age.<br /><em>A new adventure.</em></h2>
          <p>From first friendships in nursery to the confidence of primary school, children find the right encouragement for every next step.</p>
          <ul className="gv-program-list">
            <li><span>01</span><div><strong>Baby &amp; Middle Class</strong><small>Play, language, and social skills</small></div><b>↗</b></li>
            <li><span>02</span><div><strong>Top Class</strong><small>Early literacy and numeracy</small></div><b>↗</b></li>
            <li><span>03</span><div><strong>Primary</strong><small>Curiosity and strong foundations</small></div><b>↗</b></li>
          </ul>
          <Button to="academics" secondary>Explore our academics</Button>
        </div>
      </div>
    </section>

    <section className="gv-gallery-preview gv-section">
      <div className="gv-wrap">
        <div className="gv-row-heading"><SectionHeading eyebrow="Little moments, big memories" title={<>A peek at <em>our world.</em></>} /><Link to="gallery" className="gv-text-link">Explore the gallery <Arrow /></Link></div>
        <div className="gv-preview-grid">{photos.slice(0, 3).map((item, index) =>
          <Link key={item.src} to="gallery" className={`gv-preview-photo gv-preview-${index + 1}`} aria-label={`Explore the gallery: ${item.label}`}><img src={item.src} alt={item.alt} /><span>{item.label} <b>↗</b></span></Link>
        )}</div>
      </div>
    </section>

    <section className="gv-story-band gv-section">
      <div className="gv-wrap gv-story-inner"><span className="gv-story-flower" aria-hidden="true">✳</span><div><p className="gv-eyebrow">Our story so far</p><h2>Rooted in community.<br /><em>Growing every day.</em></h2><p>Founded in 2024 by Mr. Abiriga Bosco, Golden Valley began with a simple hope: a welcoming school where children in Ewuata could thrive.</p><Button to="about" secondary>Meet Golden Valley</Button></div><div className="gv-stat-card"><strong>69</strong><span>learners and counting</span><i>Every journey starts small. ✿</i></div></div>
    </section>

    <section className="gv-news-preview gv-section">
      <div className="gv-wrap">
        <div className="gv-row-heading"><SectionHeading eyebrow="From around school" title={<>Things to <em>look forward to.</em></>} /><Link to="news" className="gv-text-link">All news &amp; events <Arrow /></Link></div>
          {(eventsError || articlesError) && <p className="gv-content-empty" role="status">School news is temporarily unavailable. Please try again shortly or <a href={whatsappUrl('Hello, could you please share the latest Golden Valley school news?')} target="_blank" rel="noreferrer">message the school on WhatsApp.</a></p>}
          <div className="gv-news-grid">{[...events.slice(0, 1), ...articles.slice(0, 1)].map((post) => {
            const isEvent = post.type === 'event';
            const date = isEvent ? post.eventDate : post.createdAt;
            return <article className="gv-news-card" key={post.id}>
              <span className={`gv-news-date${isEvent ? ' gv-news-date-coral' : ''}`}><b>{formatDate(date, { month: 'short' }).toUpperCase()}</b><strong>{formatDate(date, { day: '2-digit' })}</strong><small>{formatDate(date, { year: 'numeric' })}</small></span>
              <div><span className={`gv-pill${isEvent ? ' gv-pill-coral' : ''}`}>{isEvent ? 'UPCOMING EVENT' : post.type.toUpperCase()}</span><h3>{post.title}</h3><p>{post.summary}</p><Link to={`news/${post.slug}`} className="gv-text-link">{isEvent ? 'Event details' : 'Read the update'} <Arrow /></Link></div>
            </article>;
          })}{!eventsError && !articlesError && !events.length && !articles.length && <p className="gv-content-empty">School news and upcoming events will be announced here.</p>}</div>
      </div>
    </section>

    <section className="gv-final-cta"><div className="gv-wrap gv-final-cta-inner"><span aria-hidden="true">✿</span><p className="gv-eyebrow">Come grow with us</p><h2>Your child's next<br /><em>great adventure</em> starts here.</h2><p>We'd love to help you take the first step.</p><Button to="admissions">Let's get started</Button></div></section>
  </>;
}

const pageContent = {
  about: {
    eyebrow: 'A little about us',
    title: <>Where every <em>little thing</em> matters.</>,
    intro: 'Golden Valley Kindergarten, Day Care & Primary School is a community-minded school in Ewuata, Arua City, Uganda.',
    image: 'aboutSchool',
    heading: 'A school built on a simple belief',
    paragraphs: [
      'Founded in 2024 by Mr. Abiriga Bosco, Golden Valley began with 20 learners and a vision to make quality education accessible to children in Ewuata, Arua City.',
      'Today, 69 learners call Golden Valley their school. We bring families and educators together to give children a warm place to learn, build confidence, and prepare for the future.',
    ],
    values: [['Our mission', 'To nurture young minds with excellence, integrity, and responsibility.'], ['Our approach', 'To help children grow through caring relationships, joyful learning, and a strong sense of belonging.']],
  },
  academics: {
    eyebrow: 'Curiosity starts here',
    title: <>Strong roots.<br /><em>Bright beginnings.</em></>,
    intro: 'A welcoming path from first words and friendships to confident primary learning.',
    image: 'heroClassroom',
    heading: 'Learning for every next step',
    paragraphs: ['We meet children where they are, making room for questions, practice, play, and the proud moment when something new clicks.', 'Our learning experience brings together classroom teaching, hands-on activities, play, and study tours.'],
    values: [['Baby & Middle Class', 'Play-based learning, language, and social skills for our youngest learners.'], ['Top Class', 'Early literacy and numeracy to build confidence for Primary 1.'], ['Primary', 'Strong foundations enriched by classroom activities, play, and study tours.']],
  },
  admissions: {
    eyebrow: 'Your next chapter',
    title: <>A small first step.<br /><em>A world of possibility.</em></>,
    intro: 'We would be delighted to welcome your family to Golden Valley.',
    image: 'heroStudentsGroup',
    heading: 'How to get started',
    paragraphs: ['Come by the school or get in touch with our office. We can talk you through available classes, current fees, required documents, and term dates.'],
    values: [['01 · Tell us about your child', 'Fill in the secure online application form.'], ['02 · We will be in touch', 'The school office will contact your family to discuss next steps.'], ['03 · Meet the school', 'Arrange a visit and meet the Head Teacher.'], ['04 · Get ready', 'The office will confirm available places and your reporting date.']],
  },
};

function InteriorPage({ page, theme }) {
  const content = pageContent[page];
  const settings = useSiteSettings();
  const imageSrc = settings.siteImages?.[content.image] || photo({
    aboutSchool: 'about-school.jpg',
    heroClassroom: 'hero-classroom.jpg',
    heroStudentsGroup: 'hero-students-group.jpg',
  }[content.image]);
  if (page === 'admissions') return <AdmissionPage content={content} theme={theme} />;
  return <>
    <section className="gv-page-hero"><div className="gv-wrap gv-page-hero-grid"><div><p className="gv-eyebrow">{content.eyebrow}</p><h1>{content.title}</h1><p>{content.intro}</p><Button to="contact">Talk to our team</Button></div><img src={imageSrc} alt="Golden Valley school community" /></div></section>
    <section className="gv-interior-content gv-section"><div className="gv-wrap gv-interior-grid"><div><p className="gv-eyebrow">Growing with care</p><h2>{content.heading}</h2>{content.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div><div className="gv-value-list">{content.values.map(([title, text]) => <article key={title}><span>✳</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></div></section>
    <Callout />
  </>;
}

const classOptions = [
  ['baby', 'Baby Class'], ['middle', 'Middle Class'], ['top', 'Top Class'],
  ...Array.from({ length: 7 }, (_, index) => [`primary_${index + 1}`, `Primary ${index + 1}`]),
];

function AdmissionPage({ content, theme }) {
  const settings = useSiteSettings();
  const imageSrc = settings.siteImages?.[content.image] || photo('hero-students-group.jpg');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    studentName: '', dateOfBirth: '', gender: '', classApplied: '',
    parentName: '', relationship: '', phone: '', email: '', address: '',
    previousSchool: '', additionalInformation: '', consent: false, website: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [resultsFile, setResultsFile] = useState(null);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = new FormData();
      for (const [key, value] of Object.entries(form)) {
        if (key !== 'consent' && key !== 'website' && value !== '') payload.append(key, String(value));
      }
      payload.append('consent', String(form.consent));
      payload.append('website', form.website);
      if (resultsFile) payload.append('previousSchoolResults', resultsFile);
      const result = await apiRequest('/api/admissions', {
        method: 'POST',
        body: payload,
      });
      setReference(result.application.reference || 'received');
      showToast('Your application was sent to the school office.', 'success');
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!formOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !busy) setFormOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [formOpen, busy]);

  function openApplication() {
    setError('');
    setFormOpen(true);
  }

  return <>
    <section className="gv-page-hero"><div className="gv-wrap gv-page-hero-grid"><div><p className="gv-eyebrow">{content.eyebrow}</p><h1>{content.title}</h1><p>{content.intro}</p><div className="gv-admission-hero-actions"><button className="gv-button" type="button" onClick={openApplication} disabled={!settings.applicationsOpen}>Apply now <Arrow /></button><a className="gv-button gv-button-secondary" href={whatsappUrl('Hello, I have a question about admissions at Golden Valley School.')} target="_blank" rel="noreferrer">Ask us on WhatsApp <span className="gv-arrow">↗</span></a></div></div><img src={imageSrc} alt="Golden Valley pupils in their uniforms" /></div></section>
    <section className="gv-interior-content gv-section"><div className="gv-wrap gv-admissions-grid">
      <div className="gv-admission-steps"><p className="gv-eyebrow">What happens next</p><h2>{content.heading}</h2>{content.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<div className="gv-value-list">{content.values.map(([title, text]) => <article key={title}><span>✳</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></div>
      <aside className="gv-admission-apply-card">
        <span aria-hidden="true">✿</span>
        <p className="gv-eyebrow">{settings.applicationsOpen ? 'READY WHEN YOU ARE' : 'ADMISSIONS ENQUIRIES'}</p>
        <h2>{settings.applicationsOpen ? <>Take the first <em>step.</em></> : <>Let’s talk about <em>joining us.</em></>}</h2>
        <p>{settings.applicationsOpen ? 'Tell us a little about your child and our school office will help with what comes next.' : 'Online applications are temporarily closed. Our school office can still answer your questions.'}</p>
        {settings.applicationsOpen
          ? <button className="gv-button" type="button" onClick={openApplication}>Apply now <Arrow /></button>
          : <a className="gv-button" href={whatsappUrl('Hello, I would like to ask about admissions at Golden Valley School.', settings.whatsappNumber)} target="_blank" rel="noreferrer">Contact the school <Arrow /></a>}
      </aside>
    </div></section>

    // This is the official online application form. If you are maintaining this website you can add more features here
    {formOpen && createPortal(<div className="gv-admission-modal-backdrop" data-gv-overlay="" data-theme={theme} style={siteColorVariables(settings.siteColors, theme)} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setFormOpen(false); }}>
      <section className="gv-admission-modal" role="dialog" aria-modal="true" aria-labelledby="gv-admission-modal-title">
        <button type="button" className="gv-admission-modal-close" aria-label="Close application form" autoFocus onClick={() => setFormOpen(false)} disabled={busy}>×</button>
        {reference ? <div className="gv-admission-success" role="status"><span>✿</span><p className="gv-eyebrow">APPLICATION RECEIVED</p><h2 id="gv-admission-modal-title">Thank you for saying hello.</h2><p>Your application reference is <strong>{reference}</strong>. The school office will contact you using the details you provided.</p><a className="gv-text-link" href={whatsappUrl(`Hello, I submitted admissions application ${reference}.`, settings.whatsappNumber)} target="_blank" rel="noreferrer">Continue on WhatsApp <Arrow /></a><button className="gv-button" type="button" onClick={() => setFormOpen(false)}>Done</button></div> :
          <form className="gv-contact-form gv-admission-form" onSubmit={submit}>
            <p className="gv-eyebrow">ONLINE APPLICATION</p><h2 id="gv-admission-modal-title">Let’s meet your <em>little learner.</em></h2><p className="gv-admission-form-intro">Complete the form and our school office will be in touch.</p>
            <h3 className="gv-form-section-heading">About the child</h3>
            <label>Child’s full name<input required maxLength="120" autoComplete="name" value={form.studentName} onChange={(event) => update('studentName', event.target.value)} /></label>
            <div className="gv-admission-fields"><label>Date of birth<input required type="date" max={new Date().toISOString().slice(0, 10)} value={form.dateOfBirth} onChange={(event) => update('dateOfBirth', event.target.value)} /></label><label>Class applying for<select required value={form.classApplied} onChange={(event) => update('classApplied', event.target.value)}><option value="">Choose a class</option>{classOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
            <div className="gv-admission-fields"><label>Gender<select required value={form.gender} onChange={(event) => update('gender', event.target.value)}><option value="">Choose an option</option><option value="female">Female</option><option value="male">Male</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><label>Previous school <span>(if applicable)</span><input maxLength="150" value={form.previousSchool} onChange={(event) => { update('previousSchool', event.target.value); if (!event.target.value.trim()) setResultsFile(null); }} /></label></div>
            {form.previousSchool.trim() && <label>Upload previous-school results <span>(optional · PDF, JPG, PNG · up to 4 MB)</span><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setResultsFile(event.target.files?.[0] || null)} /></label>}
            <h3 className="gv-form-section-heading">Parent or guardian</h3>
            <div className="gv-admission-fields"><label>Full name<input required maxLength="120" autoComplete="name" value={form.parentName} onChange={(event) => update('parentName', event.target.value)} /></label><label>Relationship<select required value={form.relationship} onChange={(event) => update('relationship', event.target.value)}><option value="">Choose an option</option><option value="mother">Mother</option><option value="father">Father</option><option value="guardian">Guardian</option><option value="other">Other</option></select></label></div>
            <div className="gv-admission-fields"><label>Phone number<input required type="tel" autoComplete="tel" maxLength="25" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="e.g. 0777 627 421" /></label><label>Email <span>(optional)</span><input type="email" autoComplete="email" maxLength="254" value={form.email} onChange={(event) => update('email', event.target.value)} /></label></div>
            <label>Home address<input required maxLength="300" autoComplete="street-address" value={form.address} onChange={(event) => update('address', event.target.value)} /></label>
            <label>Anything else we should know? <span>(optional)</span><textarea rows="3" maxLength="1500" value={form.additionalInformation} onChange={(event) => update('additionalInformation', event.target.value)} /></label>
            <label className="gv-admission-consent"><input required type="checkbox" checked={form.consent} onChange={(event) => update('consent', event.target.checked)} /><span>I agree that Golden Valley may use these details to respond to this application.</span></label>
            <label className="gv-admission-honey" aria-hidden="true" tabIndex="-1">Website<input tabIndex="-1" autoComplete="off" value={form.website} onChange={(event) => update('website', event.target.value)} /></label>
            {error && <p className="gv-admission-error" role="alert">{error}</p>}
            <button className="gv-button" type="submit" disabled={busy}>{busy ? 'Sending application…' : 'Send application'} <Arrow /></button>
            <p className="gv-admission-privacy">Your information is private and used only to respond to this application.</p>
          </form>}
      </section>
    </div>, document.body)}
    <Callout />
  </>;
}

function Gallery() {
  const settings = useSiteSettings();
  const photos = photosFor(settings.siteImages);
  const [selected, setSelected] = useState(null);
  const [uploaded, setUploaded] = useState([]);
  const [galleryError, setGalleryError] = useState('');
  useEffect(() => {
    apiRequest('/api/gallery')
      .then((result) => setUploaded(result.media.map((item) => ({
        src: mediaUrl(item),
        alt: item.altText || item.originalName,
        label: item.altText || item.originalName,
      }))))
      .catch((requestError) => setGalleryError(requestError.message));
  }, []);
  const galleryItems = [...photos, ...uploaded];
  useEffect(() => {
    if (selected === null) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selected]);

  return <>
    <PageHero eyebrow="A peek into our days" title={<>Little moments.<br /><em>Big memories.</em></>} intro="A few snapshots of the learning, laughter, and growing that happen at Golden Valley." />
    <section className="gv-gallery-page gv-section"><div className="gv-wrap gv-gallery-grid">{galleryItems.map((item, index) =>
      <button type="button" key={item.src} className={`gv-gallery-item gv-gallery-item-${(index % 4) + 1}`} onClick={() => setSelected(index)} aria-label={`View photo: ${item.label}`}><img src={item.src} alt={item.alt} /><span>{item.label}<b>↗</b></span></button>
    )}{galleryError && <p className="gv-content-empty" role="status">{galleryError}</p>}</div></section>
    {selected !== null && <div className="gv-lightbox" role="dialog" aria-modal="true" aria-label="School photo viewer" onClick={() => setSelected(null)}>
      <button className="gv-lightbox-close" type="button" aria-label="Close photo viewer" onClick={() => setSelected(null)}>×</button>
      <button className="gv-lightbox-prev" type="button" aria-label="Previous photo" onClick={(event) => { event.stopPropagation(); setSelected((selected + galleryItems.length - 1) % galleryItems.length); }}>←</button>
      <figure onClick={(event) => event.stopPropagation()}><img src={galleryItems[selected].src} alt={galleryItems[selected].alt} /><figcaption>{galleryItems[selected].label} · {selected + 1} / {galleryItems.length}</figcaption></figure>
      <button className="gv-lightbox-next" type="button" aria-label="Next photo" onClick={(event) => { event.stopPropagation(); setSelected((selected + 1) % galleryItems.length); }}>→</button>
    </div>}
    <Callout />
  </>;
}

function PageHero({ eyebrow, title, intro }) {
  const settings = useSiteSettings();
  const heroImage = photosFor(settings.siteImages)[2];
  return <section className="gv-page-hero"><div className="gv-wrap gv-page-hero-grid"><div><p className="gv-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{intro}</p></div><div className="gv-page-hero-art"><img src={heroImage.src} alt={heroImage.alt} /><span>Learning is an adventure ✳</span></div></div></section>;
}

function News() {
  const { posts, error } = usePosts(null);
  const events = posts.filter((post) => post.type === 'event');
  const articles = posts.filter((post) => post.type !== 'event');

  return <>
    <PageHero eyebrow="Notes from our community" title={<>Good things are<br /><em>happening here.</em></>} intro="School updates, important dates, and little glimpses of life at Golden Valley." />
    <section className="gv-news-page gv-section"><div className="gv-wrap">
      <SectionHeading eyebrow="Mark your calendar" title={<>Coming up <em>at school.</em></>} />
      {error && <p role="status">{error}</p>}
      {events.length ? <div className="gv-event-list">{events.map((event) => <article className="gv-event" key={event.id}>{event.featuredImage && <Link to={`news/${event.slug}`} aria-label={`View ${event.title}`}><img className="gv-event-feature" src={event.featuredImage} alt="" /></Link>}<div className="gv-event-date"><span>{formatDate(event.eventDate, { month: 'short' }).toUpperCase()}</span><strong>{formatDate(event.eventDate, { day: '2-digit' })}</strong><small>{formatDate(event.eventDate, { year: 'numeric' })}</small></div><div className="gv-event-info"><span className="gv-pill">SCHOOL EVENT</span><h3>{event.title}</h3><p>{event.summary}</p><Link to={`news/${event.slug}`} className="gv-text-link">View event details <Arrow /></Link></div><div className="gv-event-time"><span>{event.eventTime || formatDate(event.eventDate)}</span>{event.eventRegistrationUrl ? <a href={event.eventRegistrationUrl} target="_blank" rel="noreferrer">Register ↗</a> : <Link to={`news/${event.slug}`} aria-label={`View details for ${event.title}`}>↗</Link>}</div></article>)}</div> : <p className="gv-content-empty">New school events will be announced here. <a href={whatsappUrl('Hello, could you please share upcoming Golden Valley School events?')} target="_blank" rel="noreferrer">Ask us on WhatsApp.</a></p>}
    </div></section>
    <section className="gv-article-section gv-section"><div className="gv-wrap">    <SectionHeading eyebrow="School stories" title={<>A little news <em>from us.</em></>} />{articles.length ? <div className="gv-article-grid">{articles.map((article) => <article className="gv-article-card" key={article.id}>{article.featuredImage && <Link to={`news/${article.slug}`} aria-label={`Read ${article.title}`}><img className="gv-article-feature" src={article.featuredImage} alt="" /></Link>}<span className="gv-pill">{article.type === 'update' ? 'SCHOOL UPDATE' : 'NEWS'}</span><p className="gv-article-date">{formatDate(article.createdAt)}</p><h3><Link to={`news/${article.slug}`}>{article.title}</Link></h3><p>{article.summary}</p><div className="gv-article-actions"><Link to={`news/${article.slug}`} className="gv-text-link">Read full article <Arrow /></Link><ShareButton post={article} /></div></article>)}</div> : <p className="gv-content-empty">News and school updates will appear here.</p>}</div></section>
    <Callout />
  </>;
}

function ShareButton({ post }) {
  const [status, setStatus] = useState('');
  const url = `${window.location.origin}${window.location.pathname}#/news/${encodeURIComponent(post.slug)}`;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Article link copied.');
    } catch {
      setStatus('Could not copy the link. Select and copy the page address instead.');
    }
  }
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${post.title} ${url}`)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  return <span className="gv-share-control"><details className="gv-share-menu"><summary className="gv-share-button">Share ↗</summary><div><button type="button" onClick={copyLink}>Copy link</button><a href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a><a href={facebookUrl} target="_blank" rel="noreferrer">Facebook</a></div></details>{status && <small role="status">{status}</small>}</span>;
}

function ArticlePage({ slug }) {
  const [article, setArticle] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentForm, setCommentForm] = useState({ name: '', body: '', website: '' });
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentPending, setCommentPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setArticle(null);
    setLikes(0);
    setLiked(false);
    setComments([]);
    apiRequest(`/api/posts/${encodeURIComponent(slug)}`)
      .then((result) => {
        if (cancelled) return;
        setArticle(result.post);
        setLikes(result.likes);
        setLiked(result.liked);
        setComments(result.comments);
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!article) return undefined;
    const title = article.metaTitle || `${article.title} | Golden Valley School`;
    const description = article.metaDescription || article.summary;
    const previousTitle = document.title;
    const descriptionTag = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionTag?.content;
    document.title = title;
    if (descriptionTag) descriptionTag.content = description;
    return () => {
      document.title = previousTitle;
      if (descriptionTag && previousDescription) descriptionTag.content = previousDescription;
    };
  }, [article]);

  async function toggleLike() {
    setLikeBusy(true);
    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(slug)}/likes`, { method: 'POST', body: JSON.stringify({}) });
      setLiked(result.liked);
      setLikes(result.likes);
    } catch (requestError) {
      showToast(requestError.message, 'error');
    } finally {
      setLikeBusy(false);
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    setCommentBusy(true);
    setCommentPending(false);
    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(slug)}/comments`, {
        method: 'POST',
        body: JSON.stringify(commentForm),
      });
      setCommentForm({ name: '', body: '', website: '' });
      setCommentPending(result.pending);
      showToast('Thanks for sharing your comment. It will appear after school review.', 'success');
    } catch (requestError) {
      showToast(requestError.message, 'error');
    } finally {
      setCommentBusy(false);
    }
  }

  if (loading) return <LoadingSpinner message="Opening the school story…" />;
  if (!article) return <main className="gv-not-found"><p className="gv-eyebrow">{error || 'SCHOOL STORIES'}</p><h1>That article<br /><em>isn’t here.</em></h1><Button to="news">Back to news</Button></main>;
  const isEvent = article.type === 'event';
  return <>
    <section className="gv-page-hero"><div className="gv-wrap gv-article-detail-heading"><Link to="news" className="gv-article-back">← All news &amp; events</Link><p className="gv-eyebrow">{isEvent ? 'SCHOOL EVENT' : article.type === 'update' ? 'SCHOOL UPDATE' : 'SCHOOL NEWS'} · {formatDate(article.createdAt)}</p><h1>{article.title}</h1><p>{article.summary}</p><ShareButton post={article} /></div></section>
    <article className="gv-article-detail gv-section"><div className="gv-wrap">
      {article.featuredImage && <img className="gv-article-detail-image" src={article.featuredImage} alt={article.title} />}
      {isEvent && <div className="gv-article-event-details"><strong>{formatDate(article.eventDate)}{article.eventTime ? ` · ${article.eventTime}` : ''}</strong>{article.eventEndDate && <span>Through {formatDate(article.eventEndDate)}</span>}{article.eventLocation && <span>{article.eventLocation}</span>}{article.eventRegistrationUrl && <a href={article.eventRegistrationUrl} target="_blank" rel="noreferrer">Register for this event ↗</a>}</div>}
      <div className="gv-rich-content" dangerouslySetInnerHTML={{ __html: article.content }} />
      <div className="gv-article-reactions"><button type="button" aria-pressed={liked} disabled={likeBusy} onClick={toggleLike}>{liked ? '♥ Liked' : '♡ Like'} <span>{likes}</span></button><ShareButton post={article} /></div>
      <section className="gv-article-comments" aria-labelledby="gv-comments-title">
        <p className="gv-eyebrow">JOIN THE CONVERSATION</p><h2 id="gv-comments-title">Comments <span>({comments.length})</span></h2>
        {comments.length ? <ol>{comments.map((comment) => <li key={comment.id}><strong>{comment.name}</strong><time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time><p>{comment.body}</p></li>)}</ol> : <p className="gv-content-empty">No comments yet. Share a kind word with our school community.</p>}
        {commentPending && <p className="gv-comment-pending" role="status">Thank you. Your comment is awaiting approval by the school team.</p>}
        <form onSubmit={submitComment}><h3>Leave a comment</h3><label>Your name<input required maxLength="80" value={commentForm.name} onChange={(event) => setCommentForm({ ...commentForm, name: event.target.value })} /></label><label>Your comment<textarea required maxLength="2000" rows="4" value={commentForm.body} onChange={(event) => setCommentForm({ ...commentForm, body: event.target.value })} /></label><label className="gv-comment-honey" aria-hidden="true" tabIndex="-1">Website<input tabIndex="-1" autoComplete="off" value={commentForm.website} onChange={(event) => setCommentForm({ ...commentForm, website: event.target.value })} /></label><button className="gv-button" type="submit" disabled={commentBusy}>{commentBusy ? 'Sending…' : 'Submit comment'} <Arrow /></button><p>Comments are reviewed by the school before they appear publicly. Please keep them respectful and do not include private information.</p></form>
      </section>
    </div></article>
    <Callout />
  </>;
}

function Staff() {
  const [staff, setStaff] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    apiRequest('/api/staff')
      .then((result) => setStaff(result.staff))
      .catch((requestError) => setError(requestError.message));
  }, []);
  const leaders = staff.filter((person) => person.leadership);
  const otherStaff = staff.filter((person) => !person.leadership);
  const visibleStaff = expanded ? [...leaders, ...otherStaff] : leaders;
  return <>
    <PageHero eyebrow="The people behind the care" title={<>Kind hearts.<br /><em>Bright minds.</em></>} intro="A caring school starts with people who believe in children and show up for them every day." />
    <section className="gv-staff-page gv-section"><div className="gv-wrap"><SectionHeading eyebrow="Meet our people" title={<>The faces of <em>Golden Valley.</em></>} /><div className="gv-team-grid">{visibleStaff.map((person, index) => <article className={`gv-team-card gv-team-${['peach', 'mint', 'lemon'][index % 3]}`} key={person.id}><div className="gv-team-avatar">{person.image ? <img src={person.image} alt="" /> : person.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}<span>✳</span></div><div className="gv-team-info"><h3>{person.name}</h3><p>{person.role}</p>{person.bio && <p className="gv-team-bio">{person.bio}</p>}</div></article>)}</div>{error && <p className="gv-content-empty" role="status">{error}</p>}{otherStaff.length > 0 && <button type="button" className="gv-button gv-staff-toggle" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show school leadership' : `Meet all our staff (${otherStaff.length} more)`} <Arrow /></button>}<p className="gv-team-note">Our team is growing. Visit the school to meet the educators who make each day special.</p></div></section>
    <Callout />
  </>;
}

function Contact() {
  const settings = useSiteSettings();
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', subject: 'Admissions enquiry', message: '' });

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ ...form, website: '' }),
      });
      setSubmitted(true);
      showToast('Your message was sent to the school office.', 'success');
      setForm({ name: '', email: '', subject: 'Admissions enquiry', message: '' });
    } catch (requestError) {
      setError(requestError.message);
      showToast(requestError.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <PageHero eyebrow="We'd love to hear from you" title={<>Let's start<br /><em>a conversation.</em></>} intro="Questions about joining, visiting, or life at school? Reach out and say hello." />
    <section className="gv-contact-page gv-section"><div className="gv-wrap gv-contact-grid">
      <div className="gv-contact-details"><p className="gv-eyebrow">Come say hello</p><h2>We’re right here<br />in <em>Ewuata.</em></h2><p>We’d love to welcome you to Golden Valley. Call ahead and we’ll help plan your visit.</p>
        <a className="gv-contact-card" href={`tel:${settings.phone.replace(/[^\d+]/g, '')}`}><span>☎</span><div><small>GIVE US A CALL</small><strong>{settings.phone}</strong></div><b>↗</b></a>
        <a className="gv-contact-card" href={whatsappUrl(settings.whatsappWelcomeMessage, settings.whatsappNumber)} target="_blank" rel="noreferrer"><span>☏</span><div><small>CHAT ON WHATSAPP</small><strong>{settings.phone}</strong></div><b>↗</b></a>
        <a className="gv-contact-card" href={`mailto:${settings.email}`}><span>✉</span><div><small>SEND US AN EMAIL</small><strong>{settings.email}</strong></div><b>↗</b></a>
        <div className="gv-contact-address"><span>⌖</span><div><small>FIND OUR SCHOOL</small><p>Ewuata, Arua City<br />Uganda</p><a href="https://www.google.com/maps/search/?api=1&query=Ewuata%2C+Arua+City%2C+Uganda" target="_blank" rel="noreferrer">Open map ↗</a></div></div>
      </div>
      {submitted ? <div className="gv-contact-form gv-contact-confirmation" role="status"><span aria-hidden="true">✉</span><p className="gv-eyebrow">MESSAGE RECEIVED</p><h2>Thank you for <em>getting in touch.</em></h2><p>Your message is now in the school office inbox. A staff member will reply to the email address you provided.</p><button type="button" className="gv-button gv-button-secondary" onClick={() => setSubmitted(false)}>Send another message <Arrow /></button></div> : <form className="gv-contact-form" onSubmit={submit}><p className="gv-eyebrow">Drop us a note</p><h2>How can we <em>help?</em></h2>
        <label>Your name<input required autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Alex Okello" /></label>
        <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
        <label>What’s this about?<select value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}><option>Admissions enquiry</option><option>Arrange a school visit</option><option>School information</option><option>Other question</option></select></label>
        <label>Your message<textarea required rows="4" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Tell us a little about what you need..." /></label>
        <label className="gv-admission-honey" aria-hidden="true">Leave this field empty<input tabIndex="-1" autoComplete="off" value={form.website || ''} onChange={(event) => setForm({ ...form, website: event.target.value })} /></label>
        {error && <p className="gv-admission-error" role="alert">{error}</p>}
        <button type="submit" className="gv-button" disabled={busy}>{busy ? 'Sending message…' : 'Send message'} <Arrow /></button>
        <p className="gv-form-note">Your message is sent securely to the school office inbox. Replies are sent to your email address.</p>
      </form>}
    </div></section>
  </>;
}

function Callout() {
  return <section className="gv-callout"><div className="gv-wrap gv-callout-inner"><div><p className="gv-eyebrow">Every great journey starts somewhere</p><h2>Could Golden Valley<br /><em>be your somewhere?</em></h2></div><Button to="admissions">Find out more</Button></div></section>;
}

function Footer() {
  const settings = useSiteSettings();
  return <footer className="gv-footer"><div className="gv-wrap"><div className="gv-footer-main">
    <div className="gv-footer-brand"><Link to="home" className="gv-brand"><img src={settings.siteImages?.logoFullWhite || photo('logo-full-white.png')} alt={settings.schoolName} /></Link><p>A bright beginning for little learners in Ewuata, Arua City.</p><span className="gv-footer-location">UGANDA <b>✳</b> LEARNING TOGETHER</span></div>
    <div><h3>Find your way</h3><nav aria-label="Footer navigation">{pages.slice(1, 6).map(([id, label]) => <Link to={id} key={id}>{label}</Link>)}</nav></div>
    <div><h3>Come say hello</h3>    <a href={`tel:${settings.phone.replace(/[^\d+]/g, '')}`}>{settings.phone}</a><a href={whatsappUrl(settings.whatsappWelcomeMessage, settings.whatsappNumber)} target="_blank" rel="noreferrer">WhatsApp us ↗</a><a href={`mailto:${settings.email}`}>{settings.email}</a><p>Ewuata, Arua City<br />Uganda</p><Link to="contact" className="gv-footer-contact">Get in touch ↗</Link></div>
  </div><div className="gv-footer-bottom"><span>© {new Date().getFullYear()} Golden Valley Kindergarten, Day Care &amp; Primary School · <Link to="admin">Staff login</Link></span><span>Made for growing minds <b>✿</b></span></div></div></footer>;
}

function WhatsAppFloat() {
  const settings = useSiteSettings();
  return <a className="gv-whatsapp-float" href={whatsappUrl(settings.whatsappWelcomeMessage, settings.whatsappNumber)} target="_blank" rel="noreferrer" aria-label="Chat with Golden Valley School on WhatsApp">
    <span className="gv-whatsapp-label">WhatsApp Us</span>
    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 .7A15.2 15.2 0 0 0 2.9 23.6L1 31l7.6-2A15.2 15.2 0 1 0 16 .7Zm0 27.7a12.5 12.5 0 0 1-6.4-1.8l-.5-.3-4.5 1.2 1.2-4.4-.3-.5A12.5 12.5 0 1 1 16 28.4Zm6.9-9.3c-.4-.2-2.1-1-2.5-1.1-.3-.1-.6-.2-.8.2-.3.4-.9 1.1-1.1 1.3-.2.3-.4.3-.8.1-.4-.2-1.5-.6-2.8-1.8-1-.9-1.7-2.1-1.9-2.5-.2-.4 0-.6.2-.8l.6-.7c.2-.2.2-.4.4-.6.1-.2.1-.4 0-.6-.1-.2-.8-2-1.1-2.7-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 3s1.2 3.4 1.4 3.6c.2.2 2.4 3.7 5.8 5.1.8.4 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 2.1-.9 2.4-1.7.3-.8.3-1.5.2-1.7-.1-.2-.4-.3-.8-.5Z" /></svg>
  </a>;
}

function App() {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, '') || 'home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('gv-site-theme') === 'dark' ? 'dark' : 'light');
  const [navigating, setNavigating] = useState(false);
  const siteSettings = useSiteSettings();

  useEffect(() => {
    localStorage.setItem('gv-site-theme', theme);
  }, [theme]);

  useEffect(() => {
    const favicon = document.getElementById('gv-favicon');
    const appleTouchIcon = document.getElementById('gv-apple-touch-icon');
    const schoolCrest = siteSettings.siteImages?.logoCrest || '/images/logo-crest.png';
    if (favicon) favicon.setAttribute('href', siteSettings.faviconUrl || schoolCrest);
    if (appleTouchIcon) appleTouchIcon.setAttribute('href', siteSettings.appleTouchIconUrl || schoolCrest);
  }, [siteSettings.faviconUrl, siteSettings.appleTouchIconUrl, siteSettings.siteImages?.logoCrest]);

  useEffect(() => {
    let transition;
    const updateRoute = () => {
      const nextRoute = window.location.hash.replace(/^#\/?/, '') || 'home';
      const knownArticleRoute = /^news\/[a-z0-9-]+$/.test(nextRoute);
      setRoute(pages.some(([id]) => id === nextRoute) || nextRoute === 'admin' || knownArticleRoute ? nextRoute : 'not-found');
      setNavigating(true);
      window.clearTimeout(transition);
      transition = window.setTimeout(() => setNavigating(false), 500);
      setMenuOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', updateRoute);
    if (!window.location.hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/home`);
    return () => {
      window.removeEventListener('hashchange', updateRoute);
      window.clearTimeout(transition);
    };
  }, []);

  let page;
  if (route === 'home') page = <Home />;
  else if (pageContent[route]) page = <InteriorPage page={route} theme={theme} />;
  else if (route === 'gallery') page = <Gallery />;
  else if (route === 'news') page = <News />;
  else if (route.startsWith('news/')) page = <ArticlePage slug={route.slice('news/'.length)} />;
  else if (route === 'staff') page = <Staff />;
  else if (route === 'contact') page = <Contact />;
  else if (route === 'admin') page = <Admin />;
  else page = <main className="gv-not-found"><p className="gv-eyebrow">Oops, wrong turn</p><h1>We can’t find<br /><em>that page.</em></h1><Button to="home">Back to home</Button></main>;

  return <>
    <div className="gv-app-shell" data-theme={theme} style={siteColorVariables(siteSettings.siteColors, theme)}><Header active={route.startsWith('news/') ? 'news' : route} menuOpen={menuOpen} setMenuOpen={setMenuOpen} theme={theme} onThemeToggle={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} /><main key={route} id="gv-main-content" data-theme={theme} aria-busy={navigating}>{page}</main><Footer /></div>
    <ToastViewport colors={siteSettings.siteColors} theme={theme} />
    {navigating && <LoadingSpinner message="Opening this page…" overlay />}
    {route !== 'admin' && <WhatsAppFloat />}
  </>;
}

function mount() {
  document.body.classList.add('gv-react-site');
  let target = document.getElementById('root');
  if (!target) {
    target = document.createElement('div');
    target.id = 'root';
    document.body.prepend(target);
  }
  createRoot(target).render(<App />);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
