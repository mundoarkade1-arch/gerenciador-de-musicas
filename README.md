# Gerenciador de Músicas

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
