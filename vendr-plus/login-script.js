const auth = {
  "token": "7d45293e065b6445a93c7267f0b402e0aa0792237650dbcb",
  "user": {
    "id": "mnRjDxaJxi",
    "name": "Admin User",
    "email": "admin@test.com",
    "role": "admin",
    "plan": "elite"
  }
};

localStorage.setItem('updv_auth', JSON.stringify(auth));
console.log('✓ Login realizado como admin!');
console.log('Atualize a página para continuar...');

