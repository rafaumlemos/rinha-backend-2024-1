const express = require('express');
const {criarTransacao, listarTransacoesComSaldo} = require("./database")

const app = express();

app.use(bodyParser.json())

app.get('/health', (req, res) => {
  res.status(200);
});

app.post("/clients/:id/transacoes", async (req, res) => {
  const { id } = req.params;
  const { valor, descricao, tipo } = req.body;

  const valorAtualizado = tipo === "debito" ? -valor : valor;

  const result = await criarTransacao(id, valorAtualizado, descricao);

  if (result === null) {
    return res.status(404);
  }

  if (result.error === "balance") {
    return res.status(422);
  }

  return res.status(200).json({
    saldo: result.saldo,
    limite: result.limite
  });
});

app.get("/clients/:id/extrato", async (req, res) => {
  const { id } = req.params;

  const result = await listarTransacoesComSaldo(id);

  if (result === null) {
    return res.status(404);
  }

  const content = {
    saldo: {
      total: result.saldo.saldo,
      data_extrato: new Date().toISOString(),
      limite: result.saldo.limite
    },
    ultimas_transacoes: result.ultimas_transacoes.map(t => {
      return {
        ...t,
        tipo: t.valor < 0 ? "d" : "c"
      }
    }),
  }

  return res.status(200).json(content);
});

app.use((_, res, _) => {
  return res.status(500);
});

app.listen(process.env.PORT, () => {
  console.log('Server is running on port ${process.env.PORT}');
});