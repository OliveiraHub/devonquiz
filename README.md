# Devon Quiz

App de quiz de cinema para jogar com amigos: cada um cria uma conta (usuário e senha),
responde ao quiz aberto, e dá pra ver o ranking geral e por tema depois. Não tem servidor
próprio — todo login e dado fica no **Firebase** (Authentication + Firestore), e o app é
só HTML/CSS/JS estático.

## 1. Criar o projeto no Firebase

1. Acesse https://console.firebase.google.com e clique em **Adicionar projeto**.
2. Dê um nome (ex: `quiz-cinema`) e siga o assistente (pode desativar o Google Analytics).
3. Dentro do projeto, clique no ícone **`</>`** (Web) para registrar um app web. Não precisa
   marcar "Firebase Hosting" nessa etapa (a gente configura depois, se quiser).
4. Copie o objeto `firebaseConfig` que aparece na tela.

## 2. Colar a configuração no app

Abra `firebase-config.js` e substitua os valores de exemplo pelos que você copiou:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

## 3. Ativar Authentication (Usuário/senha)

1. No menu lateral, vá em **Build > Authentication > Get started**.
2. Na aba **Sign-in method**, ative o provedor **Email/senha**.

> Nota: o Firebase Auth exige um "e-mail". O app converte o usuário digitado em um e-mail
> interno (`usuario@quizcinema.local`) automaticamente — seus amigos só digitam usuário e
> senha, nunca veem isso.

## 4. Ativar Firestore

1. No menu lateral, vá em **Build > Firestore Database > Create database**.
2. Escolha a região mais próxima (ex: `southamerica-east1`) e comece em **modo de produção**
   (as regras de segurança do passo 5 é que vão liberar o acesso certo).

## 5. Colar as regras de segurança

1. Em **Firestore Database > Regras**, apague o conteúdo padrão.
2. Cole o conteúdo do arquivo `firestore.rules` (está na raiz deste projeto).
3. Clique em **Publicar**.

Essas regras garantem que: qualquer pessoa logada pode ler quizzes e ranking, só o admin
cria/edita/apaga quizzes, e cada pessoa só pode gravar a própria resposta uma vez (não dá
pra editar depois de enviar).

## 6. Criar sua conta e virar admin

1. Abra o app (veja passo 7) e cadastre seu usuário normalmente pela tela de cadastro.
2. No Firebase Console, vá em **Firestore Database > Dados**, abra a coleção `users` e
   encontre o documento com seu `username`.
3. Edite o campo `isAdmin` de `false` para `true`.
4. Recarregue o app — agora vai aparecer o link **Admin** no menu.

Repita só o cadastro (sem o passo do `isAdmin`) para cada amigo que for jogar.

## 7. Colocar o app no ar

O app é só arquivos estáticos (`index.html`, `style.css`, `app.js`) — dá pra hospedar em qualquer
lugar gratuito. O mais simples, já que você está usando Firebase, é o **Firebase Hosting**:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting    # escolha o projeto que você criou, pasta pública = "." (raiz)
firebase deploy
```

Ao final, o comando mostra um link tipo `https://quiz-cinema-xxxx.web.app` — é esse link que
você manda pros seus amigos.

Alternativas igualmente gratuitas: [Netlify](https://app.netlify.com/drop) (arrastar a pasta
no navegador) ou [Vercel](https://vercel.com/new).

## Como criar um novo quiz

1. Peça pro Claude gerar as perguntas, por exemplo:
   > "gera 8 perguntas sobre filmes do Tarantino, em JSON pro Devon Quiz"
2. Entre no app como admin, abra **Admin**, cole o JSON no campo e clique em **Criar quiz**.
   Isso encerra automaticamente qualquer quiz que ainda estivesse aberto.
3. Quando todo mundo já tiver votado, você pode criar o próximo quiz — o anterior já fica
   guardado no ranking.

## Como editar um quiz já publicado

Na lista de quizzes do **Admin**, clique em **Editar**: o JSON daquele quiz é carregado no
campo de texto, o botão vira **Salvar alterações** e dá pra corrigir tema, título, capa
(`imageUrl`) ou as perguntas. Clique em **Cancelar edição** pra voltar ao modo de criar um
quiz novo sem salvar nada.

Cuidado: se o quiz editado já tem gente que respondeu e você muda a ordem ou o texto das
opções, o gabarito de quem já votou pode não bater mais com o que a pessoa viu na hora de
responder. Editar é seguro pra corrigir texto/imagem; evite reordenar opções de um quiz que
já tem respostas.

Formato esperado do JSON:

```json
{
  "theme": "Diretores",
  "title": "Tarantino",
  "imageUrl": "https://exemplo.com/capa-tarantino.jpg",
  "backdropUrl": "https://exemplo.com/banner-tarantino.jpg",
  "quotes": [
    "Frase 1 de algum filme do Tarantino",
    "Frase 2",
    "Frase 3",
    "Frase 4",
    "Frase 5"
  ],
  "questions": [
    {
      "text": "Qual filme tem a cena da dança do twist?",
      "options": ["Pulp Fiction", "Kill Bill", "Reservoir Dogs", "Django Livre"],
      "correct": 0
    }
  ]
}
```

`title` é o nome que aparece grande no pôster (sem prefixo "Quiz:"). `theme` é a categoria
usada no filtro do ranking (ex: "Diretores", "Décadas") — vale repetir o mesmo tema em vários
quizzes pra agrupar no ranking. `correct` é o índice (começando em 0) da opção certa.
`imageUrl` é opcional: um link direto pra uma imagem vertical, estilo pôster de filme (usada
no carrossel de quizzes e na miniatura do admin). `backdropUrl` também é opcional: um link
pra uma imagem horizontal (paisagem), usada só no banner das telas de responder/resultado —
como o pôster é vertical, ele fica cortado quando esticado num banner horizontal; se quiser
evitar isso, passe uma imagem horizontal própria em `backdropUrl`. Se não passar nenhuma das
duas, o app gera automaticamente uma capa colorida com o nome do tema — não fica sem capa
nenhuma. `quotes` também é opcional: uma lista de frases (ideal 5) relacionadas ao tema do
quiz. Quando cada pessoa vê o resultado, aparece uma dessas frases (sempre a mesma pra ela
naquele quiz, mas pode variar entre pessoas diferentes). Se não passar `quotes`, o app usa
uma lista genérica de frases famosas de cinema.

Dica pra achar um link de imagem que funcione: peça pro Claude buscar (ele te dá a URL
direta de uma imagem, geralmente do Wikimedia Commons, que pode ser usada assim sem
problema de direitos) ou use qualquer link que termine em `.jpg`/`.png` e que abra a imagem
sozinha no navegador (clique com o botão direito numa imagem > "Copiar endereço da imagem").

## Limitações (bom saber)

- **Sem "backend anti-fraude"**: como não há servidor, um amigo com conhecimento técnico
  poderia abrir o console do navegador e inspecionar a resposta certa antes de votar. Para
  um quiz casual entre amigos isso não costuma ser problema, mas não é um app à prova de
  trapaça. Se um dia quiser fechar essa brecha, dá pra mover a correção para uma Cloud
  Function do Firebase.
- O ranking usa a **média do percentual de acerto** de cada quiz que a pessoa completou
  (geral = média de todos; por tema = média só dos quizzes daquele tema).
- Plano gratuito do Firebase (Spark) é mais que suficiente para um grupo de amigos.

## Estrutura do projeto

```
index.html              tela única (SPA) com login, quiz, ranking e admin
style.css                estilo
firebase-config.js       configuração do SEU projeto Firebase (edite este arquivo)
app.js                   toda a lógica: auth, Firestore, ranking, admin
firestore.rules          regras de segurança para colar no Firebase Console
```
