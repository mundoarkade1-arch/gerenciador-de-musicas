# Gerenciador de Músicas

## Como usar (passo a passo, para quem não é de tecnologia)

Abra o site no **Google Chrome** ou no **Microsoft Edge**, no computador.

1. **Entrar com o Google.** Clique no botão azul grande. O site lê o seu Drive sozinho e mostra as suas playlists (cada pasta dentro de "Músicas do Site" vira uma playlist). Ele nunca vê a sua senha.
2. **Ver o que mudou.** Em cada playlist aparece o que é novo desde a última atualização (+8 novas) e a coluna **Deezer**.
3. **Conferir com o Deezer.** Clique em **Conferir com o Deezer**. O site procura cada playlist pelo nome e avisa quais têm música faltando. Clique em **Ver lista** e depois em **Copiar lista** para baixar só essas músicas e colocar na pasta.
4. **Atualizar tudo.** O botão azul grande lê o Drive, sobe músicas novas (se você escolheu a pasta do PC), manda as repetidas para a lixeira (só depois que você confirmar) e atualiza o arquivo de playlists do app Toxic Player.

**Pasta do PC (opcional).** Só serve para subir músicas novas ao Drive. Clique em **Escolher pasta do PC** (ou **Usar a pasta de antes**). Sem ela, tudo funciona a partir do Drive.

### O que significa cada cor

- **Azul:** o botão principal.
- **Verde:** tudo certo ("em dia").
- **Laranja:** atenção, falta algo ("faltam 5", "não achei", "escolha uma").
- **Vermelho:** só erro.
- **Cinza:** só informação ("não procurei", "ainda não conferi").

Todo status aparece com palavra e cor. O botão de lua/sol no topo troca entre o tema claro e o escuro.

### A coluna Deezer

- **em dia:** você tem todas as músicas da playlist do Deezer.
- **faltam N:** faltam N músicas. A lista se atualiza sozinha depois que você coloca as músicas e atualiza o Drive, sem consultar o Deezer de novo.
- **não achei:** o site não achou o nome no Deezer (comum quando você renomeou a pasta). Clique em **Colar link**, cole o endereço da playlist do Deezer e clique em **Usar este link**. Se for uma playlist de nicho, marque **Não procurar esta**.
- **escolha uma:** achou mais de uma parecida. Clique em **Escolher** e toque na certa.
- **não procurei:** você marcou "Não procurar esta".
- **ainda não conferi:** ainda não foi consultada.

O Deezer só é consultado quando você clica em **Conferir** (em pequenos grupos, com pausa). Os resultados e as suas escolhas ficam só neste navegador. Não precisa de chave nem senha.

### Minhas playlists

- **Adicionadas recentemente:** playlist automática (7, 14, 30 ou 60 dias; clique em **Opções**).
- **Opções** de cada playlist: renomear no app, esconder a pasta, link e conferência do Deezer.
- **Pastas de cantor** (dentro de "Artistas") ficam separadas e não são conferidas no Deezer.
- Se você nunca atualizou por este site, clique em **Já atualizei antes** para ele começar a contar o que é novo a partir de agora.

### Ferramentas extras

O botão **Ferramentas extras** (no topo) abre uma página com o que se usa raramente: músicas repetidas no PC, Top 200 e playlist no YouTube, novidades das listas, passos manuais do Drive, ferramentas de JSON, motor do PC (Toxic Engine) e histórico.

## Como colocar no GitHub (sem bagunçar as pastas)

1. Descompacte o zip. Abra a pasta descompactada e selecione **tudo que está dentro dela** (Ctrl + A).
2. No repositório, clique em **Add file > Upload files** e arraste tudo de uma vez (inclusive a pasta `.github`).
3. Confira que `index.html` e `app.js` aparecem na **raiz** do repositório, e não dentro de outra pasta. Depois clique em **Commit changes**.

---

## Para quem mexe no código

**Segurança (CSP no `index.html`).** O Deezer bloqueia chamadas diretas do navegador (CORS), então o site usa o modo JSONP do Deezer (`output=jsonp`). Por isso `script-src` ganhou **só** `https://api.deezer.com`. Nada mais foi aberto (`connect-src`, `default-src` e `img-src` continuam iguais).

**Drive como fonte.** As playlists vêm das pastas de "Músicas do Site". Como o site sobe só uma cópia de música repetida, ele também lembra, pelo `playlists-inteligentes.json` antigo, em quais playlists cada música estava. O formato do JSON (`toxic-playlists`, versão 2) não mudou.

Programa simples que roda no navegador (Chrome ou Edge).

- Lê o Drive (pasta "Músicas do Site") como fonte principal; a pasta do PC é opcional (só leitura).
- Mostra as listas top 200 (por gênero) e marca o que você já tem.
- Mostra o que entrou e saiu de cada lista.
- Com o login do Google: sobe o que falta para o Drive, manda repetidas para a lixeira do Drive (só com a sua confirmação) e atualiza o arquivo de playlists.

Nada é apagado de vez. Visual claro (com tema escuro opcional), sem animações.

As listas são atualizadas todo dia pelo GitHub (arquivo `.github/workflows/atualizar.yml`).
Para mudar quais listas são buscadas, edite `scripts/atualizar.mjs`.

## Playlist no YouTube (Ferramentas extras > Top 200)

Cada lista do Top 200 pode virar uma playlist **privada** no seu YouTube, aos poucos:

1. Abra **Ferramentas extras > Top 200**, escolha a lista e clique em **Entrar com YouTube**.
2. Clique em **Enviar as próximas N músicas**. O site busca cada música no YouTube e coloca na playlist.
3. A cota grátis do YouTube é de 10.000 unidades por dia (cerca de 64 músicas). Quando acabar, volte no dia seguinte e clique de novo: ele continua de onde parou.
4. Cada música aparece com um selo: **no YouTube**, **falta no YouTube** ou **sem resultado**. Se você apagar um vídeo direto no YouTube, ele volta a aparecer como "falta".

O progresso fica salvo neste navegador (arquivo `youtube.js`). A cota renova à meia-noite do horário do Pacífico (4h ou 5h em Brasília).

### Configuração (uma vez só, no Google Cloud Console)

No mesmo projeto do `CLIENT_ID` do `app.js`:

1. **APIs e serviços > Biblioteca**: ative a **YouTube Data API v3**.
2. **Tela de consentimento OAuth > Escopos**: adicione `https://www.googleapis.com/auth/youtube`.
3. Se o app estiver em modo "Teste", seu e-mail precisa estar na lista de usuários de teste.
4. Sua conta do Google precisa ter um canal no YouTube (basta abrir youtube.com e criar).

Não precisa de cartão nem de faturamento. O YouTube Premium não muda a cota da API.
