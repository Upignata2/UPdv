#!/usr/bin/env node
/**
 * Setup script - Create first admin user
 * Usage: npm run setup
 */

import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (q) => new Promise(resolve => rl.question(q, resolve));

async function setup() {
  console.log('\n🚀 Bem-vindo ao setup do UPdv!\n');
  console.log('Este script irá:');
  console.log('1. Limpar o banco de dados (DEV ONLY)');
  console.log('2. Registrar você como ADMIN com plano ELITE\n');

  const name = await question('Seu nome: ');
  const email = await question('Seu email: ');
  const pass = await question('Sua senha: ');

  if (!name || !email || !pass) {
    console.log('❌ Dados inválidos!');
    rl.close();
    return;
  }

  try {
    // Reset database
    console.log('\n⏳ Resetando banco de dados...');
    const resetRes = await fetch('http://localhost:8080/api/debug/reset-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!resetRes.ok) {
      console.log('❌ Erro ao resetar banco:', await resetRes.text());
      rl.close();
      return;
    }

    console.log('✓ Banco de dados resetado!');

    // Register as admin
    console.log('⏳ Registrando como ADMIN...');
    const signupRes = await fetch('http://localhost:8080/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, pass })
    });

    if (!signupRes.ok) {
      console.log('❌ Erro ao registrar:', await signupRes.text());
      rl.close();
      return;
    }

    const data = await signupRes.json();
    console.log('\n✅ Sucesso!\n');
    console.log('Nome:', data.user.name);
    console.log('Email:', data.user.email);
    console.log('Role:', data.user.role);
    console.log('Plano:', data.user.plan);
    console.log('\nToken (salve em um lugar seguro):');
    console.log(data.token);

    rl.close();
  } catch (e) {
    console.log('❌ Erro:', e.message);
    console.log('\n💡 Certifique-se de que o servidor está rodando em http://localhost:8080');
    rl.close();
  }
}

setup();
