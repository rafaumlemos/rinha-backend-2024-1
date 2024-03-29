const express = require('express');
const bodyParser = require('body-parser');
const {listarTransacoesComSaldo, criarTransacaoTryHard} = require("./database")

const app = express();

app.use(express.json());
app.use(bodyParser.json())

app.get("/", (_req, res) => {
  return res.status(200).send({ok: true});
});

app.get('/health', (req, res) => {
  return res.status(200).send({health: true});;
});

app.post("/clientes/:id/transacoes", async (req, res) => {
  const { id } = req.params;
  const { valor, descricao, tipo } = req.body;

  if (tipo !== "c" && tipo !== "d") {
    return res.sendStatus(422);
  }

  if (!descricao || descricao.length > 10) {
    return res.sendStatus(422);
  }

  if (!Number.isInteger(valor)) {
    return res.sendStatus(422);
  }

  if (parseInt(id) > 5) {
    return res.sendStatus(404);
  }

  const valorAtualizado = tipo === "d" ? valor * -1 : valor;

  const result = await criarTransacaoTryHard(id, valorAtualizado, descricao);

  if (result === null) {
    return res.sendStatus(404);
  }

  if (result.error === "balance") {
    return res.sendStatus(422);
  }

  return res.status(200).send({
    saldo: result.saldo,
    limite: result.limite
  });
});

app.get("/clientes/:id/extrato", async (req, res) => {
  const { id } = req.params;

  if (parseInt(id) > 5) {
    return res.sendStatus(404);
  }

  const result = await listarTransacoesComSaldo(id);

  const content = {
    saldo: {
      total: parseFloat(result.saldo.saldo),
      data_extrato: new Date().toISOString(),
      limite: parseFloat(result.saldo.limite)
    },
    ultimas_transacoes: result.ultimas_transacoes.map(t => {
      return {
        ...t,
        valor: Math.abs(parseFloat(t.valor)),
        tipo: t.valor < 0 ? "d" : "c"
      }
    }),
  }

  return res.status(200).send(content);
});

app.listen(3000, () => {
  console.log(`Server is running on port 3000`);
});