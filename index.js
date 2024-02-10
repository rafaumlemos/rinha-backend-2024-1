const express = require('express');
const bodyParser = require('body-parser');
const {criarTransacao, listarTransacoesComSaldo} = require("./database")

const app = express();

const router = express.Router();

app.use(bodyParser.json())

router.get('/health', (req, res) => {
  return res.status(200);
});

router.post("/clientes/:id/transacoes", async (req, res) => {
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

router.get("/clientes/:id/extrato", async (req, res) => {
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

app.use((_req, res, _next) => {
  return res.status(500);
});

app.listen(3000, () => {
  console.log(`Server is running on port 3000`);
});