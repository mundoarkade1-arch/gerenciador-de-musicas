# Gerenciador de Músicas

Programa simples que roda no navegador (Chrome ou Edge).

- Acha músicas repetidas na sua pasta.
- Mostra as listas top 200 e marca o que você já tem.
- Mostra o que entrou e saiu de cada lista.

Ele só lê os nomes dos arquivos. Não apaga, não muda e não envia nada.

As listas são atualizadas todo dia pelo GitHub (arquivo `.github/workflows/atualizar.yml`).
Para mudar quais listas são buscadas, edite `scripts/atualizar.mjs`.
