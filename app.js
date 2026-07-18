// Devon Quiz - logica do app (SPA estatica + Firebase)
// Nenhum servidor proprio: autenticacao e dados ficam 100% no Firebase
// (Authentication + Firestore). Veja README.md para configurar seu projeto.

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const EMAIL_DOMAIN = 'quizcinema.local';
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

let currentUser = null; // objeto do Firebase Auth
let currentUserDoc = null; // { username, isAdmin }
let authReady = false;

// ---------- Helpers ----------

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

function showOnly(viewId) {
  const ids = [
    'view-loading', 'view-login', 'view-register', 'view-dashboard',
    'view-quiz', 'view-result', 'view-ranking', 'view-admin',
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== viewId);
  });
}

function setError(elId, msg) {
  const el = document.getElementById(elId);
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
  } else {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function setSuccess(elId, msg) {
  const el = document.getElementById(elId);
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
  } else {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Pôsteres (imagem do quiz ou capa gerada) ----------

const POSTER_GRADIENTS = [
  'linear-gradient(135deg, #8E0E00, #1F1C18)',
  'linear-gradient(135deg, #0F2027, #203A43, #2C5364)',
  'linear-gradient(135deg, #654ea3, #7d3ac1)',
  'linear-gradient(135deg, #16222A, #3A6073)',
  'linear-gradient(135deg, #3a1c71, #d76d77, #ffaf7b)',
  'linear-gradient(135deg, #7f0000, #37000a)',
  'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  'linear-gradient(135deg, #360033, #0b8793)',
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function posterGradient(seedStr) {
  const idx = hashString(String(seedStr || 'x')) % POSTER_GRADIENTS.length;
  return POSTER_GRADIENTS[idx];
}

// ---------- Frase de filme (aparece na tela de resultado) ----------

const MOVIE_QUOTES = [
  { quote: 'A vida encontra um caminho.', movie: 'Jurassic Park' },
  { quote: 'Vamos precisar de um barco maior.', movie: 'Tubarão' },
  { quote: 'E.T. liga pra casa.', movie: 'E.T. - O Extraterrestre' },
  { quote: 'Estrada? Aonde vamos não precisamos de estradas.', movie: 'De Volta para o Futuro' },
  { quote: 'Vou fazer a ele uma oferta que não poderá recusar.', movie: 'O Poderoso Chefão' },
  { quote: 'Que a Força esteja com você.', movie: 'Star Wars' },
  { quote: 'Eu voltarei.', movie: 'O Exterminador do Futuro' },
  { quote: 'A vida é como uma caixa de chocolates. Você nunca sabe o que vai encontrar.', movie: 'Forrest Gump - O Contador de Histórias' },
  { quote: 'A primeira regra é: você não fala sobre isso.', movie: 'Clube da Luta' },
  { quote: 'Eu sou o rei do mundo!', movie: 'Titanic' },
  { quote: 'Não existe colher.', movie: 'Matrix' },
  { quote: 'Hakuna Matata.', movie: 'O Rei Leão' },
  { quote: 'Ou você morre herói, ou vive o suficiente para se ver virar vilão.', movie: 'Batman - O Cavaleiro das Trevas' },
  { quote: 'Ao meu sinal, soltem a fúria.', movie: 'Gladiador' },
  { quote: 'O amor é a única coisa que transcende o tempo e o espaço.', movie: 'Interestelar' },
  { quote: 'Sempre.', movie: 'Harry Potter e as Relíquias da Morte' },
];

// se o quiz tiver suas proprias frases (campo "quotes" no JSON), sorteia uma
// delas a cada vez que a pessoa ve o resultado — cada item pode ser so um
// texto ou um objeto { "quote": "...", "movie": "..." } com atribuicao.
// Senao, sorteia da lista generica de frases de cinema acima.
function pickResultQuote(quiz) {
  const pool = (Array.isArray(quiz.quotes) && quiz.quotes.length > 0) ? quiz.quotes : MOVIE_QUOTES;
  const item = pool[Math.floor(Math.random() * pool.length)];
  if (typeof item === 'string') return { quote: item, movie: null };
  return { quote: item.quote || item.text || '', movie: item.movie || null };
}

// remove caracteres que quebrariam a sintaxe de url("...") em CSS
function safeCssUrl(url) {
  return String(url).replace(/["'()\\]/g, '');
}

function backgroundInlineForUrl(url, seedStr) {
  if (url) {
    // aspas simples aqui de proposito: essa string vai dentro de um atributo
    // style="..." com aspas duplas no HTML, entao nao pode usar aspas duplas
    // dentro do url(...) — isso fechava o atributo mais cedo e corrompia a URL.
    return `background-image: url('${safeCssUrl(url)}');`;
  }
  return `background-image: ${posterGradient(seedStr)};`;
}

// capa vertical (pôster) — usada no carrossel e na miniatura do admin
function posterBackgroundInline(quiz) {
  return backgroundInlineForUrl(quiz.imageUrl, quiz.theme || quiz.title || quiz.id);
}

// thumbnail pequena (lista do admin)
function renderThumbHtml(quiz) {
  const style = posterBackgroundInline(quiz);
  return `<div class="thumb" style="${style}"></div>`;
}

// card do carrossel do dashboard: o quiz aberto vem colorido e maior (current),
// os encerrados vem em preto-e-branco e menores (closed). Titulo (e tema, se
// for o atual) ficam embutidos na parte de baixo do proprio poster.
function renderCarouselCardHtml(quiz, isCurrent, target) {
  const style = posterBackgroundInline(quiz);
  const badge = isCurrent ? '<span class="badge open">ABERTO</span>' : '';
  const overlay = `
    <div class="poster-overlay">
      <div class="title">${escapeHtml(quiz.title)}</div>
    </div>
  `;
  return `<div class="carousel-card ${isCurrent ? 'current' : 'closed'}" style="${style}" data-goto="${target}">${badge}${overlay}</div>`;
}

// cabeçalho simples (topo das telas de responder/resultado) — sem imagem de
// fundo: o pôster é vertical e sempre ficava cortado feio esticado num banner
// horizontal, então aqui é só texto.
function renderBackdropHtml(quiz, badgeHtml) {
  return `
    <div class="quiz-header">
      ${badgeHtml || ''}
      <h1>${escapeHtml(quiz.title)}</h1>
      <p class="muted">${escapeHtml(quiz.theme)}</p>
    </div>
  `;
}

// embaralha as opcoes SO na exibicao (pra quem responde nao conseguir
// "decorar" que a resposta certa costuma vir numa posicao fixa no JSON).
// cada item guarda seu indice original (oi), que e o que vai no "value" do
// radio — entao a checagem de acerto continua comparando com q.correct
// normalmente, sem precisar saber que a ordem na tela mudou.
function shuffledOptionsWithIndex(options) {
  const withIndex = options.map((opt, oi) => ({ opt, oi }));
  for (let i = withIndex.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [withIndex[i], withIndex[j]] = [withIndex[j], withIndex[i]];
  }
  return withIndex;
}

function bindGotoHandlers(root) {
  (root || document).querySelectorAll('[data-goto]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.dataset.goto; });
  });
}

function authErrorMessage(err) {
  const code = err && err.code;
  const map = {
    'auth/email-already-in-use': 'Esse usuário já existe.',
    'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres).',
    'auth/invalid-email': 'Usuário inválido.',
    'auth/user-not-found': 'Usuário ou senha inválidos.',
    'auth/wrong-password': 'Usuário ou senha inválidos.',
    'auth/invalid-credential': 'Usuário ou senha inválidos.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  };
  return map[code] || 'Ocorreu um erro. Tente novamente.';
}

// ---------- Nav ----------

function renderNav() {
  const nav = document.getElementById('nav-links');
  if (currentUser && currentUserDoc) {
    const fullName = currentUserDoc.displayName || currentUserDoc.username;
    const firstName = fullName.trim().split(/\s+/)[0];
    nav.innerHTML = `
      <a href="#/">Home</a>
      <a href="#/ranking">Ranking</a>
      ${currentUserDoc.isAdmin ? '<a href="#/admin">Admin</a>' : ''}
      <span class="muted">|</span>
      <button class="linklike" id="nav-displayname-btn" title="Clique para mudar seu nome de exibição">
        <span class="dn-full">${escapeHtml(fullName)}</span><span class="dn-short">${escapeHtml(firstName)}</span>
      </button>
      <button class="linklike" id="logout-btn">Sair</button>
    `;
    document.getElementById('nav-displayname-btn').addEventListener('click', openEditDisplayName);
    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
  } else {
    nav.innerHTML = `<a href="#/login">Entrar</a><a href="#/register">Cadastrar</a>`;
  }
}

// nome de exibição: pode ser mudado a qualquer momento clicando no proprio
// nome na barra de titulo. E usado em todo lugar (dashboard, ranking, nav);
// o "usuario" continua existindo so pra fazer login.
async function openEditDisplayName() {
  const current = currentUserDoc.displayName || currentUserDoc.username;
  const next = prompt('Como você quer aparecer pro grupo?', current);
  if (next === null) return; // cancelado
  const trimmed = next.trim();
  if (!trimmed) {
    alert('O nome de exibição não pode ficar vazio.');
    return;
  }
  if (trimmed === current) return;
  try {
    await db.collection('users').doc(currentUser.uid).update({ displayName: trimmed });
    currentUserDoc.displayName = trimmed;
    renderNav();
    route();
  } catch (err) {
    console.error(err);
    alert('Não foi possível salvar o novo nome. Tente novamente.');
  }
}

// ---------- Auth ----------

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('login-error', null);
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    await auth.signInWithEmailAndPassword(usernameToEmail(username), password);
    location.hash = '#/';
  } catch (err) {
    console.error(err);
    setError('login-error', authErrorMessage(err));
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('register-error', null);
  const username = document.getElementById('register-username').value.trim();
  const displayName = document.getElementById('register-displayname').value.trim();
  const password = document.getElementById('register-password').value;
  const confirm = document.getElementById('register-confirm').value;

  if (!USERNAME_RE.test(username)) {
    setError('register-error', 'Usuário deve ter 3 a 20 caracteres: letras, números ou _.');
    return;
  }
  if (password.length < 6) {
    setError('register-error', 'Senha precisa ter pelo menos 6 caracteres.');
    return;
  }
  if (password !== confirm) {
    setError('register-error', 'As senhas não conferem.');
    return;
  }

  try {
    const cred = await auth.createUserWithEmailAndPassword(usernameToEmail(username), password);
    await db.collection('users').doc(cred.user.uid).set({
      username,
      displayName: displayName || username,
      isAdmin: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    location.hash = '#/';
  } catch (err) {
    console.error(err);
    setError('register-error', authErrorMessage(err));
  }
});

async function fetchUserDoc(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  currentUserDoc = user ? await fetchUserDoc(user.uid) : null;
  authReady = true;
  renderNav();
  route();
});

// ---------- Dados: quizzes ----------

async function fetchAllQuizzes() {
  const snap = await db.collection('quizzes').orderBy('createdAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchQuiz(quizId) {
  const snap = await db.collection('quizzes').doc(quizId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function fetchUserResult(quizId, uid) {
  const snap = await db.collection('quizzes').doc(quizId).collection('results').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

// ---------- Dashboard ----------

async function loadDashboard() {
  document.getElementById('dashboard-greeting').textContent = `Olá, ${currentUserDoc.displayName || currentUserDoc.username}`;

  const slot = document.getElementById('dashboard-carousel-slot');
  slot.innerHTML = '<p class="muted">Carregando...</p>';

  const quizzes = await fetchAllQuizzes(); // mais recente primeiro
  if (quizzes.length === 0) {
    slot.innerHTML = `<div class="hero-empty"><p>Nenhum quiz por aqui ainda. Assim que sair um novo, ele aparece aqui.</p></div>`;
    return;
  }

  // cinza (fechado) e so pra quiz com status !== 'open' — antes isso so olhava
  // pro PRIMEIRO quiz aberto encontrado, entao se por algum motivo existisse
  // mais de um quiz aberto ao mesmo tempo, os outros ficavam cinza por engano.
  const openQuizzes = quizzes.filter((q) => q.status === 'open');
  const resultsByQuizId = new Map(
    await Promise.all(openQuizzes.map(async (q) => [q.id, await fetchUserResult(q.id, currentUser.uid)]))
  );
  const ordered = [...quizzes].reverse(); // mais antigo -> mais novo, pro carrossel ler como linha do tempo

  const cardsHtml = ordered.map((q) => {
    const isOpen = q.status === 'open';
    const target = isOpen
      ? (resultsByQuizId.get(q.id) ? `#/quiz/${q.id}/resultado` : `#/quiz/${q.id}`)
      : `#/quiz/${q.id}/resultado`;
    return renderCarouselCardHtml(q, isOpen, target);
  }).join('');

  const captionHtml = openQuizzes.length > 0
    ? ''
    : `<p class="muted" style="text-align:center; margin-top:10px;">Nenhum quiz aberto no momento.</p>`;

  slot.innerHTML = `
    <div class="carousel-wrap">
      <button type="button" class="carousel-nav prev" id="carousel-prev" aria-label="Anterior">‹</button>
      <div class="carousel" id="dashboard-carousel">${cardsHtml}</div>
      <button type="button" class="carousel-nav next" id="carousel-next" aria-label="Próximo">›</button>
    </div>
    ${captionHtml}
  `;

  bindGotoHandlers();

  const carouselEl = document.getElementById('dashboard-carousel');
  const currentEl = carouselEl.querySelector('.carousel-card.current') || carouselEl.lastElementChild;
  if (currentEl) currentEl.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });

  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const scrollStep = () => Math.max(200, carouselEl.clientWidth * 0.6);
  prevBtn.addEventListener('click', () => carouselEl.scrollBy({ left: -scrollStep(), behavior: 'smooth' }));
  nextBtn.addEventListener('click', () => carouselEl.scrollBy({ left: scrollStep(), behavior: 'smooth' }));
  const updateNavVisibility = () => {
    const scrollable = carouselEl.scrollWidth > carouselEl.clientWidth + 4;
    prevBtn.classList.toggle('hidden', !scrollable);
    nextBtn.classList.toggle('hidden', !scrollable);
  };
  updateNavVisibility();
  window.addEventListener('resize', updateNavVisibility);
}

// ---------- Responder quiz ----------

async function loadQuizTake(quizId) {
  setError('quiz-error', null);
  document.getElementById('quiz-backdrop-slot').innerHTML = '';
  const quiz = await fetchQuiz(quizId);
  if (!quiz) {
    document.getElementById('quiz-questions').innerHTML = '<p>Quiz não encontrado.</p>';
    return;
  }
  if (quiz.status !== 'open') {
    location.hash = `#/quiz/${quizId}/resultado`;
    return;
  }
  const already = await fetchUserResult(quizId, currentUser.uid);
  if (already) {
    location.hash = `#/quiz/${quizId}/resultado`;
    return;
  }

  document.getElementById('quiz-backdrop-slot').innerHTML = renderBackdropHtml(quiz);

  const container = document.getElementById('quiz-questions');
  container.innerHTML = quiz.questions.map((q, qi) => `
    <div class="question-block">
      <h3>${qi + 1}. ${escapeHtml(q.text)}</h3>
      ${shuffledOptionsWithIndex(q.options).map(({ opt, oi }) => `
        <label class="option-row">
          <input type="radio" name="q_${qi}" value="${oi}" required>
          <span>${escapeHtml(opt)}</span>
        </label>
      `).join('')}
    </div>
  `).join('');

  const form = document.getElementById('quiz-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    setError('quiz-error', null);

    const chosen = quiz.questions.map((q, qi) => {
      const input = form.querySelector(`input[name="q_${qi}"]:checked`);
      return input ? Number(input.value) : null;
    });

    if (chosen.some((c) => c === null)) {
      setError('quiz-error', 'Responda todas as perguntas antes de enviar.');
      return;
    }

    let correctCount = 0;
    quiz.questions.forEach((q, qi) => {
      if (chosen[qi] === q.correct) correctCount += 1;
    });
    const total = quiz.questions.length;
    const percentage = Math.round((correctCount / total) * 1000) / 10;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      await db.collection('quizzes').doc(quizId).collection('results').doc(currentUser.uid).set({
        username: currentUserDoc.username,
        displayName: currentUserDoc.displayName || currentUserDoc.username,
        theme: quiz.theme,
        quizTitle: quiz.title,
        chosen,
        correctCount,
        total,
        percentage,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      location.hash = `#/quiz/${quizId}/resultado`;
    } catch (err) {
      console.error(err);
      setError('quiz-error', 'Erro ao enviar suas respostas. Tente novamente.');
      submitBtn.disabled = false;
    }
  };
}

// ---------- Resultado individual ----------

async function loadResult(quizId) {
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.getElementById('result-backdrop-slot').innerHTML = '';
  const quiz = await fetchQuiz(quizId);
  if (!quiz) {
    document.getElementById('result-content').innerHTML = '<div class="card"><p>Quiz não encontrado.</p></div>';
    return;
  }

  const badgeHtml = `<span class="badge ${quiz.status === 'open' ? 'open' : 'closed'}">${quiz.status === 'open' ? 'ABERTO' : 'ENCERRADO'}</span>`;
  document.getElementById('result-backdrop-slot').innerHTML = renderBackdropHtml(quiz, badgeHtml);

  const myResult = await fetchUserResult(quizId, currentUser.uid);
  const content = document.getElementById('result-content');

  if (!myResult) {
    content.innerHTML = `
      <div class="card">
        <p>Você ainda não respondeu esse quiz.</p>
        ${quiz.status === 'open' ? `<a href="#/quiz/${quizId}" class="btn">Responder agora</a>` : ''}
      </div>
    `;
    return;
  }

  const questionsHtml = quiz.questions.map((q, qi) => {
    const userOptIdx = myResult.chosen[qi];
    const optsHtml = q.options.map((opt, oi) => {
      let cls = '';
      if (oi === q.correct) cls = 'correct';
      else if (oi === userOptIdx) cls = 'wrong-chosen';
      return `
        <div class="option-row ${cls}">
          <span>${escapeHtml(opt)}</span>
          ${oi === q.correct ? '<span class="muted" style="margin-left:auto;">correta</span>' : ''}
          ${oi !== q.correct && oi === userOptIdx ? '<span class="muted" style="margin-left:auto;">sua resposta</span>' : ''}
        </div>
      `;
    }).join('');
    return `<div class="question-block"><h3>${qi + 1}. ${escapeHtml(q.text)}</h3>${optsHtml}</div>`;
  }).join('');

  const quote = pickResultQuote(quiz);

  content.innerHTML = `
    <div class="card score-hero">
      <div class="pct">${myResult.percentage}%</div>
      <p class="muted">${myResult.correctCount} de ${myResult.total} corretas</p>
      <p class="movie-quote">"${escapeHtml(quote.quote)}"${quote.movie ? `<span class="movie-quote-source">${escapeHtml(quote.movie)}</span>` : ''}</p>
    </div>
    <div class="card">
      <h2>Gabarito</h2>
      ${questionsHtml}
    </div>
  `;
}

// ---------- Ranking ----------

function buildRanking(rows) {
  const byUser = new Map();
  rows.forEach((r) => {
    if (!byUser.has(r.username)) {
      byUser.set(r.username, {
        username: r.username,
        displayName: r.displayName || r.username,
        quizzes: 0, sumPct: 0, totalQuestions: 0, totalCorrect: 0,
      });
    }
    const entry = byUser.get(r.username);
    entry.quizzes += 1;
    entry.sumPct += Number(r.percentage);
    entry.totalQuestions += Number(r.total || 0);
    entry.totalCorrect += Number(r.correctCount || 0);
  });
  const ranking = Array.from(byUser.values()).map((e) => ({
    username: e.username,
    displayName: e.displayName,
    quizzes: e.quizzes,
    totalQuestions: e.totalQuestions,
    totalCorrect: e.totalCorrect,
    average: Math.round((e.sumPct / e.quizzes) * 10) / 10,
  }));
  ranking.sort((a, b) => b.average - a.average || b.quizzes - a.quizzes);
  return ranking;
}

function renderRankingTable(ranking) {
  const body = document.getElementById('ranking-body');
  body.innerHTML = ranking.map((r, i) => {
    const firstName = r.displayName.trim().split(/\s+/)[0];
    return `
    <tr>
      <td>${i + 1}</td>
      <td><span class="dn-full">${escapeHtml(r.displayName)}</span><span class="dn-short">${escapeHtml(firstName)}</span></td>
      <td>${r.quizzes}</td>
      <td>${r.totalCorrect}</td>
      <td>${r.average}%</td>
    </tr>
  `;
  }).join('');
}

let rankingRowsCache = [];
let rankingActiveTheme = null; // null = "Geral" (sem filtro)

async function loadRanking() {
  const [snap, usersSnap] = await Promise.all([
    db.collectionGroup('results').get(),
    db.collection('users').get(),
  ]);
  const usersById = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
  // o doc de cada resultado tem como ID o uid de quem respondeu (ver envio do
  // quiz), entao dá pra buscar o nome de exibição ATUAL do usuário em vez de
  // confiar só no que ficou gravado no momento da resposta.
  const rows = snap.docs.map((d) => {
    const data = d.data();
    const userDoc = usersById.get(d.id);
    const displayName = (userDoc && (userDoc.displayName || userDoc.username)) || data.displayName || data.username;
    return { ...data, displayName };
  });
  rankingRowsCache = rows;
  rankingActiveTheme = null;

  const empty = document.getElementById('ranking-empty');
  const content = document.getElementById('ranking-content');

  if (rows.length === 0) {
    empty.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  content.classList.remove('hidden');

  const themes = Array.from(new Set(rows.map((r) => r.theme))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  renderThemeTabs(themes);
  renderRankingForActiveTheme();
}

function renderThemeTabs(themes) {
  const tabs = document.getElementById('ranking-theme-tabs');
  const chips = ['<button type="button" class="theme-tab active" data-theme="">Geral</button>']
    .concat(themes.map((t) => `<button type="button" class="theme-tab" data-theme="${escapeHtml(t)}">${escapeHtml(t)}</button>`));
  tabs.innerHTML = chips.join('');

  tabs.querySelectorAll('.theme-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      rankingActiveTheme = btn.dataset.theme || null;
      tabs.querySelectorAll('.theme-tab').forEach((b) => b.classList.toggle('active', b === btn));
      renderRankingForActiveTheme();
    });
  });
}

function renderRankingForActiveTheme() {
  const rows = rankingActiveTheme
    ? rankingRowsCache.filter((r) => r.theme === rankingActiveTheme)
    : rankingRowsCache;
  renderRankingTable(buildRanking(rows));
}

// ---------- Admin ----------

let editingQuizId = null;
let adminQuizzesById = new Map();

async function loadAdmin() {
  setError('admin-error', null);
  setSuccess('admin-success', null);
  cancelEditQuiz();
  await Promise.all([renderAdminQuizList(), renderAdminUserList()]);
}

async function renderAdminUserList() {
  const list = document.getElementById('admin-user-list');
  list.innerHTML = '<p class="muted">Carregando...</p>';

  const snap = await db.collection('users').orderBy('username').get();
  const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  if (users.length === 0) {
    list.innerHTML = '<p class="muted">Nenhum usuário cadastrado ainda.</p>';
    return;
  }

  list.innerHTML = users.map((u) => `
    <div class="quiz-list-item">
      <div class="info">
        <strong>${escapeHtml(u.displayName || u.username)}</strong>
        <div class="muted" style="font-size:0.85rem;">usuário: ${escapeHtml(u.username)}${u.isAdmin ? ' · admin' : ''}</div>
      </div>
      <div class="actions">
        <button class="btn small secondary" data-action="edit-user" data-uid="${u.uid}">Editar nome</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('button[data-action="edit-user"]').forEach((btn) => {
    const user = users.find((u) => u.uid === btn.dataset.uid);
    btn.addEventListener('click', () => editUserDisplayName(user));
  });
}

async function editUserDisplayName(user) {
  const current = user.displayName || user.username;
  const next = prompt(`Novo nome de exibição pra "${user.username}":`, current);
  if (next === null) return; // cancelado
  const trimmed = next.trim();
  if (!trimmed) {
    alert('O nome de exibição não pode ficar vazio.');
    return;
  }
  if (trimmed === current) return;
  try {
    await db.collection('users').doc(user.uid).update({ displayName: trimmed });
    if (user.uid === currentUser.uid) {
      currentUserDoc.displayName = trimmed;
      renderNav();
    }
    await renderAdminUserList();
  } catch (err) {
    console.error(err);
    alert('Não foi possível salvar o novo nome. Tente novamente.');
  }
}

async function renderAdminQuizList() {
  const list = document.getElementById('admin-quiz-list');
  list.innerHTML = '<p class="muted">Carregando...</p>';

  const quizzes = await fetchAllQuizzes();
  if (quizzes.length === 0) {
    list.innerHTML = '<p class="muted">Nenhum quiz criado ainda.</p>';
    adminQuizzesById = new Map();
    return;
  }

  const rows = await Promise.all(quizzes.map(async (q) => {
    const resultsSnap = await db.collection('quizzes').doc(q.id).collection('results').get();
    return { ...q, respondents: resultsSnap.size };
  }));

  adminQuizzesById = new Map(rows.map((q) => [q.id, q]));

  list.innerHTML = rows.map((q) => `
    <div class="quiz-list-item">
      ${renderThumbHtml(q)}
      <div class="info">
        <strong>${escapeHtml(q.title)}</strong>
        <span class="badge ${q.status === 'open' ? 'open' : 'closed'}">${q.status === 'open' ? 'ABERTO' : 'ENCERRADO'}</span>
        <div class="muted" style="font-size:0.85rem;">
          ${escapeHtml(q.theme)} · ${q.questions.length} perguntas · ${q.respondents} responderam
        </div>
      </div>
      <div class="actions">
        <a href="#/quiz/${q.id}/resultado" class="btn small secondary">Ver</a>
        <button class="btn small secondary" data-action="edit" data-id="${q.id}">Editar</button>
        ${q.status === 'open'
          ? `<button class="btn small secondary" data-action="close" data-id="${q.id}">Encerrar</button>`
          : `<button class="btn small secondary" data-action="reopen" data-id="${q.id}">Reabrir</button>`}
        <button class="btn small danger" data-action="delete" data-id="${q.id}">Apagar</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleAdminQuizAction(btn.dataset.action, btn.dataset.id));
  });
}

function startEditQuiz(quiz) {
  editingQuizId = quiz.id;

  const payload = { theme: quiz.theme, title: quiz.title, questions: quiz.questions };
  if (quiz.imageUrl) payload.imageUrl = quiz.imageUrl;
  if (quiz.quotes && quiz.quotes.length) payload.quotes = quiz.quotes;

  document.getElementById('admin-json').value = JSON.stringify(payload, null, 2);
  document.getElementById('admin-form-title').textContent = `Editando: ${quiz.title}`;
  document.getElementById('admin-submit-btn').textContent = 'Salvar alterações';
  document.getElementById('admin-cancel-edit').classList.remove('hidden');
  document.getElementById('admin-close-others-wrap').classList.add('hidden');
  document.getElementById('admin-edit-warning').classList.toggle('hidden', !(quiz.respondents > 0));

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEditQuiz() {
  editingQuizId = null;
  document.getElementById('admin-json').value = '';
  document.getElementById('admin-form-title').textContent = 'Criar novo quiz';
  document.getElementById('admin-submit-btn').textContent = 'Criar quiz';
  document.getElementById('admin-cancel-edit').classList.add('hidden');
  document.getElementById('admin-close-others-wrap').classList.remove('hidden');
  document.getElementById('admin-edit-warning').classList.add('hidden');
  document.getElementById('admin-close-others').checked = true;
}

document.getElementById('admin-cancel-edit').addEventListener('click', cancelEditQuiz);

async function handleAdminQuizAction(action, quizId) {
  setError('admin-error', null);
  setSuccess('admin-success', null);
  try {
    if (action === 'edit') {
      const quiz = adminQuizzesById.get(quizId);
      if (quiz) startEditQuiz(quiz);
      return;
    }
    if (action === 'close') {
      await db.collection('quizzes').doc(quizId).update({ status: 'closed' });
    } else if (action === 'reopen') {
      await db.collection('quizzes').doc(quizId).update({ status: 'open' });
    } else if (action === 'delete') {
      if (!confirm('Apagar este quiz e todas as respostas?')) return;
      const resultsSnap = await db.collection('quizzes').doc(quizId).collection('results').get();
      const batch = db.batch();
      resultsSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(db.collection('quizzes').doc(quizId));
      await batch.commit();
    }
    await renderAdminQuizList();
  } catch (err) {
    console.error(err);
    setError('admin-error', 'Erro ao executar ação: ' + err.message);
  }
}

document.getElementById('admin-import-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('admin-error', null);
  setSuccess('admin-success', null);

  const raw = document.getElementById('admin-json').value;
  const closeOthers = document.getElementById('admin-close-others').checked;

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    setError('admin-error', 'JSON inválido: ' + err.message);
    return;
  }

  if (!data.theme || !data.title || !Array.isArray(data.questions) || data.questions.length === 0) {
    setError('admin-error', 'JSON precisa ter theme, title e uma lista questions com pelo menos 1 pergunta.');
    return;
  }
  if (data.imageUrl && typeof data.imageUrl !== 'string') {
    setError('admin-error', '"imageUrl" precisa ser um texto (link da imagem) ou ser omitido.');
    return;
  }
  if (data.quotes !== undefined) {
    const quotesOk = Array.isArray(data.quotes) && data.quotes.every((q) => {
      if (typeof q === 'string') return q.trim().length > 0;
      return q && typeof q === 'object' && typeof q.quote === 'string' && q.quote.trim().length > 0;
    });
    if (!quotesOk) {
      setError('admin-error', '"quotes" precisa ser uma lista de frases (texto simples ou {"quote": "...", "movie": "..."}) ou ser omitido.');
      return;
    }
  }
  for (let i = 0; i < data.questions.length; i++) {
    const q = data.questions[i];
    if (!q.text || !Array.isArray(q.options) || q.options.length < 2) {
      setError('admin-error', `Pergunta ${i + 1} inválida: precisa de "text" e ao menos 2 "options".`);
      return;
    }
    if (typeof q.correct !== 'number' || q.correct < 0 || q.correct >= q.options.length) {
      setError('admin-error', `Pergunta ${i + 1} inválida: "correct" precisa ser o índice (0, 1, 2...) da opção certa.`);
      return;
    }
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    if (editingQuizId) {
      // modo edicao: so atualiza o conteudo do quiz existente, nao mexe em status/data
      await db.collection('quizzes').doc(editingQuizId).update({
        theme: data.theme,
        title: data.title,
        imageUrl: data.imageUrl || null,
        quotes: data.quotes || [],
        questions: data.questions.map((q) => ({ text: q.text, options: q.options, correct: q.correct })),
      });
      setSuccess('admin-success', 'Quiz atualizado com sucesso!');
      cancelEditQuiz();
    } else {
      if (closeOthers) {
        const quizzes = await fetchAllQuizzes();
        const openOnes = quizzes.filter((q) => q.status === 'open');
        if (openOnes.length > 0) {
          const batch = db.batch();
          openOnes.forEach((q) => batch.update(db.collection('quizzes').doc(q.id), { status: 'closed' }));
          await batch.commit();
        }
      }

      await db.collection('quizzes').add({
        theme: data.theme,
        title: data.title,
        imageUrl: data.imageUrl || null,
        quotes: data.quotes || [],
        status: 'open',
        questions: data.questions.map((q) => ({ text: q.text, options: q.options, correct: q.correct })),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      document.getElementById('admin-json').value = '';
      setSuccess('admin-success', 'Quiz criado com sucesso!');
    }
    await renderAdminQuizList();
  } catch (err) {
    console.error(err);
    setError('admin-error', 'Erro ao salvar: ' + err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- Router ----------

function route() {
  if (!authReady) {
    showOnly('view-loading');
    return;
  }

  const hash = location.hash || '#/';
  const isAuthed = !!currentUser;

  if (!isAuthed) {
    if (hash.startsWith('#/register')) {
      showOnly('view-register');
      return;
    }
    showOnly('view-login');
    return;
  }

  if (hash.startsWith('#/login') || hash.startsWith('#/register')) {
    location.hash = '#/';
    return;
  }

  const parts = hash.replace(/^#\//, '').split('/').filter(Boolean);

  if (parts.length === 0) {
    showOnly('view-dashboard');
    loadDashboard();
    return;
  }

  if (parts[0] === 'ranking') {
    showOnly('view-ranking');
    loadRanking();
    return;
  }

  if (parts[0] === 'admin') {
    if (!currentUserDoc || !currentUserDoc.isAdmin) {
      location.hash = '#/';
      return;
    }
    showOnly('view-admin');
    loadAdmin();
    return;
  }

  if (parts[0] === 'quiz' && parts[1]) {
    const quizId = parts[1];
    if (parts[2] === 'resultado') {
      showOnly('view-result');
      loadResult(quizId);
      return;
    }
    showOnly('view-quiz');
    loadQuizTake(quizId);
    return;
  }

  location.hash = '#/';
}

window.addEventListener('hashchange', route);
showOnly('view-loading');
