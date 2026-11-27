# Gerenciador de Músicas

## Como usar (passo a passo, para quem não é de tecnologia)

Abra o site no **Google Chrome** ou no **Microsoft Edge**, no computador.

1. **Escolher a pasta.** Clique no botão vermelho grande e escolha a pasta das suas músicas. O site só lê, não muda nada nela. Da segunda vez em diante o botão vira **Usar a pasta de antes** e abre a mesma pasta; se o Chrome perguntar, clique em **Permitir**. Para ele não perguntar mais, escolha **Permitir em todas as visitas** quando essa opção aparecer.
2. **Entrar com o Google.** Para o site enxergar o seu Drive. Ele nunca vê a sua senha.
3. **Atualizar tudo.** Um clique e o site lê o Drive, sobe o que falta, manda as repetidas para a lixeira (só depois de você confirmar) e atualiza as playlists.

Dúvidas? Clique em **? Como usar** no canto de cima do site.

### Minhas playlists (aparece sozinho depois de escolher a pasta)

Mostra cada pasta como uma playlist e o que mudou desde a última atualização.

- **Quantas músicas são novas** em cada pasta (+8 novas), quantas saíram e se a pasta é nova ou sumiu.
- **O que vai mudar na próxima atualização:** a prévia fica na tela antes de você clicar em **Atualizar tudo agora**.
- **Adicionadas recentemente:** uma playlist automática com o que chegou nos últimos 7, 14, 30 ou 60 dias (você escolhe).
- **Novas no topo:** dentro de cada playlist, as músicas novas ficam no começo da lista.
- **Renomear** a playlist no app sem mudar o nome da pasta, ou **Não virar playlist** para esconder uma pasta (dá para voltar atrás).
- **Histórico** das últimas 30 atualizações.
- Se você já atualizou antes de existir este painel, clique em **Já atualizei antes** para o site começar a contar o que é novo a partir de agora.

O registro fica só neste navegador (guarda códigos curtos, nunca o nome nem o conteúdo das músicas). Se você limpar os dados do navegador, ele recomeça do zero.

### O que tem em cada aba

- **Repetidas no PC:** mostra as músicas repetidas da sua pasta. Só mostra, não apaga.
- **Top 200:** as músicas mais tocadas por gênero, com a marca do que você já tem. Daqui dá para criar uma playlist no YouTube.
- **Novidades:** o que entrou e saiu das listas.
- **Google Drive:** os passos 1 a 4 (ler, subir, limpar, playlists).
- **Motor do PC (avançado):** só para quem usa o programa Toxic Engine no computador.

## Como colocar no GitHub (sem bagunçar as pastas)

1. Descompacte o zip. Abra a pasta descompactada e selecione **tudo que está dentro dela** (Ctrl + A).
2. No repositório, clique em **Add file > Upload files** e arraste tudo de uma vez (inclusive a pasta `.github`).
3. Confira que `index.html` e `app.js` aparecem na **raiz** do repositório, e não dentro de outra pasta. Depois clique em **Commit changes**.

---

## Para quem mexe no código

Programa simples que roda no navegador (Chrome ou Edge).

- Lê a pasta de músicas do PC (só leitura) e acha as repetidas.
- Mostra as listas top 200 (por gênero) e marca o que você já tem.
- Mostra o que entrou e saiu de cada lista.
- Com o login do Google: sobe o que falta para o Drive, manda repetidas para a lixeira do Drive (só com a sua confirmação) e atualiza o arquivo de playlists.

Nada é apagado de vez. Visual: preto, cinza e vermelho cereja, sem animações.

As listas são atualizadas todo dia pelo GitHub (arquivo `.github/workflows/atualizar.yml`).
Para mudar quais listas são buscadas, edite `scripts/atualizar.mjs`.

## Playlist no YouTube (aba Top 200)

Cada lista do Top 200 pode virar uma playlist **privada** no seu YouTube, aos poucos:

1. Abra a aba **Top 200**, escolha a lista e clique em **Entrar com YouTube**.
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
