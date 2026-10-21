import { get, run } from './database.js';
import { cleanEditorHtml, toSlug } from './content.js';

const initialPosts = [
  {
    type: 'news',
    title: 'Term 1, 2027 registration is now open',
    summary: 'Contact the school office to ask about places in Baby, Middle, Top, and Primary 1, or to arrange a visit.',
    content: '<p>We welcome enquiries for the new term. Call the school office or visit us in Ewuata to find out about available classes and arrange a visit.</p>',
    published: 1,
  },
  {
    type: 'news',
    title: 'Primary 3 study tour a big success',
    summary: 'Learners explored local landmarks and brought their questions back to class.',
    content: '<p>Our learners explored local landmarks and returned with notebooks full of questions to continue investigating in class.</p>',
    published: 1,
  },
  {
    type: 'update',
    title: 'Welcome to the new term',
    summary: 'Get in touch with the school office for term dates, reporting information, and uniform guidance.',
    content: '<p>We look forward to welcoming our learners and families back to school. Please contact the office for reporting dates, uniform guidance, and timetable information.</p>',
    published: 1,
  },
  {
    type: 'event',
    title: 'Open Day for New Families',
    summary: 'Meet the teachers, explore the classrooms, and get to know the school community.',
    content: '<p>Visit Golden Valley, meet the teachers, explore our classrooms, and ask us about learning and admissions.</p>',
    eventDate: '2026-11-07',
    eventTime: '10:00 AM – 1:00 PM',
    published: 1,
  },
  {
    type: 'event',
    title: 'End-of-Year Prize Giving',
    summary: 'Celebrate learners’ achievements with families and the school community.',
    content: '<p>Join learners, families, and staff as we celebrate the achievements and growth of every class.</p>',
    eventDate: '2026-12-04',
    eventTime: '2:00 PM',
    published: 1,
  },
];

const sampleArticles = [
  {
    type: 'news',
    title: 'Learning grows through stories, songs and play',
    summary: 'A look at how joyful, hands-on classroom experiences help young learners build confidence and curiosity.',
    content: '<p>At Golden Valley, children learn by asking questions, trying new things, and sharing ideas with one another. Stories, songs, puzzles, drawing, and guided play give learners different ways to explore new concepts.</p><p>Our teachers encourage every child to take part at their own pace. A new word, a completed puzzle, or the courage to speak in front of a group can all be important steps in a learner’s growth.</p><p>Families can support this learning at home by talking about the day, reading together, and celebrating each child’s effort as well as their achievements.</p>',
    published: 1,
    metaTitle: 'Learning through stories, songs and play',
    metaDescription: 'Discover how stories, music, and guided play support curiosity and confidence at Golden Valley School.',
  },
  {
    type: 'news',
    title: 'Small steps help learners build big confidence',
    summary: 'Encouragement, practice, and a caring routine help children feel ready to take on new challenges.',
    content: '<p>Confidence develops over time. In class, learners are encouraged to try, ask for help, and have another go when something feels difficult.</p><p>Simple routines help children know what to expect, while kind feedback helps them notice the progress they are making. Whether a learner is practising a new sound, solving a problem, or working with a classmate, each small step matters.</p><p>We value the partnership between families and teachers. Sharing what a child enjoys and what they are practising helps us give every learner thoughtful support.</p>',
    published: 1,
    metaTitle: 'Helping learners build confidence',
    metaDescription: 'Learn how encouragement and supportive routines help children grow in confidence at school.',
  },
  {
    type: 'update',
    title: 'A welcome note for Golden Valley families',
    summary: 'A friendly reminder that families can contact the school office for visit, enrolment, and school information.',
    content: '<p>Welcome to Golden Valley School. We are glad to be part of each learner’s journey and appreciate the trust families place in our school community.</p><p>If you are planning a visit, enquiring about enrolment, or looking for general school information, please contact the office before travelling so our team can help you plan.</p><p>Families can use the contact form on this website or call the school using the number shown on the Contact page. We look forward to hearing from you.</p>',
    published: 1,
    metaTitle: 'A welcome note for Golden Valley families',
    metaDescription: 'Contact the Golden Valley School office for visit arrangements, enrolment enquiries, and general information.',
  },
  {
    type: 'update',
    title: 'Working together to support every learner',
    summary: 'Regular communication between families and teachers helps children feel supported at school and at home.',
    content: '<p>Children do their best when the important adults in their lives work together. Families know their children well, and teachers see how they learn and connect with others in class.</p><p>Please share questions or updates with the school office so the right staff member can follow up. When contacting us, include your name and a suitable way to reach you, and avoid sending sensitive student documents through the public contact form.</p><p>Thank you for helping us create a caring, respectful learning community for every child.</p>',
    published: 1,
    metaTitle: 'Working together to support every learner',
    metaDescription: 'Golden Valley values communication between families and teachers to support each learner’s wellbeing and progress.',
  },
];

async function insertPost(post) {
  const slug = toSlug(post.title);
  if (get('SELECT id FROM posts WHERE slug = ?', [slug])) return;
  const content = await cleanEditorHtml(post.content);
  run(
    `INSERT INTO posts
      (slug, type, title, summary, content, event_date, event_time, meta_title, meta_description, published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      slug,
      post.type,
      post.title,
      post.summary,
      content,
      post.eventDate ?? null,
      post.eventTime ?? '',
      post.metaTitle ?? '',
      post.metaDescription ?? '',
      post.published,
    ],
  );
}

export async function seedPosts() {
  const count = get('SELECT COUNT(*) AS count FROM posts').count;
  const samplesSeeded = get('SELECT value FROM settings WHERE key = ?', ['sampleArticlesSeeded'])?.value === 'true';
  if (count === 0) {
    for (const post of [...initialPosts, ...sampleArticles]) await insertPost(post);
  } else if (!samplesSeeded) {
    for (const post of sampleArticles) await insertPost(post);
  }
  if (!samplesSeeded) {
    run(
      "INSERT INTO settings (key, value) VALUES ('sampleArticlesSeeded', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'",
    );
  }
}
