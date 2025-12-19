const auth = {
  "token": "e0a2f9be25a540021b018198f05d1258af5f6645ceea6270",
  "user": {
    "id": "2o2il_ZwMa",
    "name": "Admin User",
    "email": "admin@test.com",
    "role": "admin",
    "plan": "elite"
  }
};

localStorage.setItem('updv_auth', JSON.stringify(auth));
console.log('✓ Login realizado como admin!');
console.log('Atualize a página para continuar...');
