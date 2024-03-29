const pg = require('pg');

const URL = process.env.DB_URL || 'postgres://postgres:password@localhost:5432/postgres';

const pool = new pg.Pool({
  connectionString: URL,
  max: (Number(process.env.DB_POOL) || 200),
  min: (Number(process.env.DB_POOL) || 15),
  idleTimeoutMillis: 0,
  connectionTimeoutMillis: 10000
});

pool.on('error', connect);

pool.once('connect', async () => {
  const checkTablesQuery = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name = 'clientes' OR table_name = 'transacoes')
  `);

  if (checkTablesQuery.rows.length === 0) {
    return pool.query(`
      CREATE UNLOGGED TABLE clientes (
        id INTEGER PRIMARY KEY NOT NULL,
        saldo INTEGER NOT NULL,
        limite INTEGER NOT NULL
      );

      CREATE UNLOGGED TABLE transacoes (
          id SERIAL PRIMARY KEY,
          cliente_id INTEGER NOT NULL,
          valor INTEGER NOT NULL,
          descricao VARCHAR(10) NOT NULL,
          realizada_em TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_transacoes_cliente_id ON transacoes
      (
          cliente_id ASC
      );

      INSERT INTO clientes (id, saldo, limite) VALUES (1, 0, 100000);
      INSERT INTO clientes (id, saldo, limite) VALUES (2, 0, 80000);
      INSERT INTO clientes (id, saldo, limite) VALUES (3, 0, 1000000);
      INSERT INTO clientes (id, saldo, limite) VALUES (4, 0, 10000000);
      INSERT INTO clientes (id, saldo, limite) VALUES (5, 0, 500000);
    `)
  }
});

async function connect() {
  try {
      await pool.connect();
      console.log('connected to database');
  } catch(err){
      setTimeout(() => {
          connect();
          console.error(`failed to connect ${err}`);
      }, 3000)
  }
}

connect();

module.exports.criarTransacao = async function (clientId, valor, descricao) {
  const isDebit = valor < 0;

  const transaction = await pool.connect();

  await transaction.query('BEGIN');

  const getSaldo = await transaction.query(`SELECT saldo, limite FROM clientes WHERE id = $1 FOR UPDATE`, [clientId]);

  if (getSaldo.rows.length === 0) {
    await transaction.query('ROLLBACK');
    transaction.release();
    return null;
  }

  const saldo = parseFloat(getSaldo.rows[0].saldo);
  const limite = parseFloat(getSaldo.rows[0].limite);

  const balance = saldo + limite;

  if (isDebit && (Math.abs(valor) > balance)) {
    await transaction.query('ROLLBACK');
    transaction.release();
    return {error: "balance"};
  }

  await transaction.query(`
    INSERT INTO transacoes (cliente_id, valor, descricao)
    VALUES ($1, $2, $3)
  `, [clientId, valor, descricao]);

  const newBalance = await transaction.query(`
    UPDATE clientes
    SET saldo = saldo + $1
    WHERE id = $2
    RETURNING saldo
  `, [valor, clientId]);

  await transaction.query('COMMIT');

  transaction.release();

  return {
    saldo: parseFloat(newBalance.rows[0].saldo),
    limite
  };
}

module.exports.listarTransacoesComSaldo = async function (clientId) {
  const transaction = await pool.connect();

  const saldoPromise = transaction.query(`SELECT saldo, limite FROM clientes WHERE id = $1`, [clientId]);

  const transacoesPromise = transaction.query(`
    SELECT
      valor,
      descricao,
      realizada_em
    FROM transacoes
    WHERE cliente_id = $1
    ORDER BY id DESC
    LIMIT 10
  `, [clientId]);

  const [saldo, transacoes] = await Promise.all([saldoPromise, transacoesPromise]);

  if (saldo.rows.length === 0) {
    transaction.release();
    return null;
  }

  transaction.release();

  return {
    saldo: saldo.rows[0],
    ultimas_transacoes: transacoes.rows
  };
}

module.exports.criarTransacaoTryHard = async function (clientId, valor, descricao) {
  const isDebit = valor < 0;

  const poolInstance = await pool.connect();

  if (!isDebit) {
    const credit = await poolInstance.query(`
      UPDATE clientes
      SET saldo = saldo + $1
      WHERE id = $2
      RETURNING saldo, limite
    `, [valor, clientId]);

    await poolInstance.query(`
      INSERT INTO transacoes (cliente_id, valor, descricao)
      VALUES ($1, $2, $3)
    `, [clientId, valor, descricao]);

    poolInstance.release();

    return {
      saldo: parseFloat(credit.rows[0].saldo),
      limite: parseFloat(credit.rows[0].limite)
    };
  }

  const debit = await poolInstance.query(`
    UPDATE clientes
    SET saldo = saldo + $1
    WHERE id = $2
    AND saldo + limite >= ABS($1)
    RETURNING saldo, limite
  `, [valor, clientId]);

  if (debit.rows.length === 0) {
    poolInstance.release();
    return {error: "balance"};
  }

  await poolInstance.query(`
    INSERT INTO transacoes (cliente_id, valor, descricao)
    VALUES ($1, $2, $3)
  `, [clientId, valor, descricao]);

  poolInstance.release();

  return {
    saldo: parseFloat(debit.rows[0].saldo),
    limite: parseFloat(debit.rows[0].limite)
  };
}