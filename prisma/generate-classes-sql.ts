const TENANT_ID = 'cmnergpg2002qjv0474zpfddr';

const CLASS_TYPE: Record<string, string> = {
  'HYROX': 'cmnewklwb0009vbyr6amiabzw',
  'SCULPT': 'cmnewklt20005vbyrfrv94gxc',
  'STRENGTH': 'cmnewklrg0003vbyrcgwdags8',
  'POWER SCULPT': 'cmnewklut0007vbyrvz60kiwn',
  'RECOVERY ROOM': 'cmnewkly1000bvbyryuz3jzz0',
  'OPEN GYM': 'cmnezczpx0001vb56uiqububd',
  'BE TORO METHOD': '10a1d5c4-0924-49fd-9a49-b79f91b3a716',
  'RECOVERY SOCIAL CLUB': '486e9752-c6d0-4ae5-9f48-1f1520e246f3',
  'RUNNING (exterior)': '542c03f2-6b2f-4e83-92d6-258c64af60dc',
  'HYROX Workshop': 'cmnewklwb0009vbyr6amiabzw',
};

const COACH: Record<string, string> = {
  'Alexa Zarain': 'cmney0y3e0004vbzl4ztq75hw',
  'Alma Guerra': 'cmney0yfn0009vbzlg7y4udm4',
  'Amanda Colon': 'cmney0yqj000evbzluow80rvt',
  'Angelo Pillas': 'cmney0z1i000jvbzlty4ygyna',
  'Annare Rospligliosi': 'cmney0zeg000ovbzlh11fny9e',
  'Carlota Lopez': 'cmney0zu1000tvbzli7tn0ofy',
  'Cristobal Pecchio': 'cmney10am000yvbzlcpxyagdt',
  'David Martin': '7166db84-413f-487c-befd-b8aa0f12c7e9',
  'Jaime Lorenzo': 'cmney10ry0013vbzlv8oyleio',
  'Javier Alonso': 'cmney11cg0018vbzlyanl458w',
  'Jesús García': 'cmney11xp001dvbzlyanl458w',
  'Joris Poels': 'cmney12mj001ivbzllgh3xbth',
  'Manfredi Giordano': 'cmney13bp001nvbzlm9i6scma',
  'Manuela Londoño': '350fbc87-d562-46e2-acef-b7860e6e6167',
  'Marisa Caniego': 'cmney1403001svbzlkrrin1gx',
  'Mia Rapoport': 'cmney14rf001xvbzl1d4t6vyx',
  'Pablo Sánchez': 'cmney15fe0022vbzluenr05wy',
  'Pepe Salama': '9a06d2fb-9d6c-45b2-be70-e37e762fc764',
  'Raquel Monedero': 'cmney162b0027vbzlqk1gqtuz',
  'Valeria Puleo Guzmán': 'c6c1b8e4-c0ab-4f67-821d-87992c259f01',
};

const STAFF_COACH: Record<string, string> = {
  'Justicia': 'cmney16qe002cvbzlybfh11vu',
  'Salamanca': 'cmney17mb002hvbzlige6yim7',
};

const ROOM = {
  Justicia: {
    recovery: 'cmneywagl052nvb1fascosf1t',
    sculpt: 'cmneytvkq04yzvb1frlyib1ju',
    strength: 'cmneyvzgq052lvb1futc1v4m1',
  },
  Salamanca: {
    recovery: 'cmneyx3hu052pvb1fqvntejyw',
    strength: 'cmneyyg72052rvb1fxdl6zl6g',
  },
};

const DAY_MAP: Record<string, string> = {
  'Lun 6': '2026-04-06',
  'Mar 7': '2026-04-07',
  'Mié 8': '2026-04-08',
  'Jue 9': '2026-04-09',
  'Vie 10': '2026-04-10',
  'Sáb 11': '2026-04-11',
  'Dom 12': '2026-04-12',
};

function getRoomId(sede: string, className: string): string {
  const recoveryTypes = ['RECOVERY ROOM', 'RECOVERY SOCIAL CLUB'];
  const sculptTypes = ['SCULPT', 'BE TORO METHOD', 'POWER SCULPT'];

  if (sede === 'Justicia') {
    if (recoveryTypes.includes(className)) return ROOM.Justicia.recovery;
    if (sculptTypes.includes(className)) return ROOM.Justicia.sculpt;
    return ROOM.Justicia.strength;
  } else {
    if (recoveryTypes.includes(className)) return ROOM.Salamanca.recovery;
    return ROOM.Salamanca.strength;
  }
}

function getCoachId(instructor: string, sede: string): string {
  if (instructor === '—' || instructor === '') {
    return STAFF_COACH[sede];
  }
  const id = COACH[instructor];
  if (!id) throw new Error(`Unknown coach: "${instructor}"`);
  return id;
}

function getClassTypeId(className: string): string {
  const id = CLASS_TYPE[className];
  if (!id) throw new Error(`Unknown class type: "${className}"`);
  return id;
}

function getTag(className: string, subcategory: string): string | null {
  if (className === 'HYROX Workshop') return 'Workshop';
  if (subcategory && subcategory.trim()) return subcategory.trim();
  return null;
}

function escapeSQL(val: string | null): string {
  if (val === null) return 'NULL';
  return `'${val.replace(/'/g, "''")}'`;
}

const rawData = `Lun 6,07:00–07:55,HYROX,,Jaime Lorenzo,Justicia
Lun 6,07:00–07:50,HYROX,,Annare Rospligliosi,Salamanca
Lun 6,07:20–08:10,SCULPT,,Marisa Caniego,Justicia
Lun 6,08:00–09:00,RECOVERY ROOM,,—,Salamanca
Lun 6,08:05–09:05,RECOVERY ROOM,,—,Justicia
Lun 6,08:10–09:00,STRENGTH,Conditioning,Jaime Lorenzo,Justicia
Lun 6,08:10–09:10,STRENGTH,Glutes,Annare Rospligliosi,Salamanca
Lun 6,08:30–09:20,SCULPT,,Marisa Caniego,Justicia
Lun 6,09:15–10:15,RECOVERY ROOM,,—,Justicia
Lun 6,09:15–10:15,RECOVERY ROOM,,—,Salamanca
Lun 6,09:20–10:10,STRENGTH,Glutes,Jaime Lorenzo,Justicia
Lun 6,09:20–10:10,POWER SCULPT,,Angelo Pillas,Salamanca
Lun 6,09:40–10:30,SCULPT,,Marisa Caniego,Justicia
Lun 6,10:25–11:25,RECOVERY ROOM,,—,Justicia
Lun 6,10:30–11:30,OPEN GYM,,—,Justicia
Lun 6,10:30–11:30,RECOVERY ROOM,,—,Salamanca
Lun 6,10:50–11:40,SCULPT,,Alexa Zarain,Justicia
Lun 6,11:30–12:30,OPEN GYM,,—,Salamanca
Lun 6,11:30–12:30,OPEN GYM,,—,Justicia
Lun 6,11:35–12:35,RECOVERY ROOM,,—,Justicia
Lun 6,11:45–12:45,RECOVERY ROOM,,—,Salamanca
Lun 6,12:30–13:30,OPEN GYM,,—,Salamanca
Lun 6,12:30–13:30,OPEN GYM,,—,Justicia
Lun 6,12:55–13:55,RECOVERY ROOM,,—,Justicia
Lun 6,13:00–14:00,RECOVERY ROOM,,—,Salamanca
Lun 6,13:30–14:20,SCULPT,,Alexa Zarain,Justicia
Lun 6,14:00–14:50,STRENGTH,Glutes,Pablo Sánchez,Salamanca
Lun 6,14:05–15:05,RECOVERY ROOM,,—,Justicia
Lun 6,14:10–15:00,STRENGTH,Glutes,Jaime Lorenzo,Justicia
Lun 6,14:15–15:15,RECOVERY ROOM,,—,Salamanca
Lun 6,15:15–16:15,OPEN GYM,,—,Justicia
Lun 6,15:30–16:30,OPEN GYM,,—,Salamanca
Lun 6,15:30–16:30,RECOVERY ROOM,,—,Salamanca
Lun 6,16:50–17:40,POWER SCULPT,,Mia Rapoport,Salamanca
Lun 6,17:45–18:45,RECOVERY ROOM,,—,Justicia
Lun 6,17:45–18:45,RECOVERY ROOM,,—,Salamanca
Lun 6,18:00–18:55,HYROX,,Jesús García,Justicia
Lun 6,18:00–18:50,HYROX,,Jaime Lorenzo,Salamanca
Lun 6,18:10–19:00,SCULPT,,Alma Guerra,Justicia
Lun 6,19:00–20:00,RECOVERY ROOM,,—,Justicia
Lun 6,19:00–20:00,RECOVERY ROOM,,—,Salamanca
Lun 6,19:10–20:00,STRENGTH,Conditioning,Jesús García,Justicia
Lun 6,19:10–20:10,STRENGTH,Glutes,Jaime Lorenzo,Salamanca
Lun 6,19:20–20:10,SCULPT,,Alma Guerra,Justicia
Lun 6,20:15–21:15,RECOVERY ROOM,,—,Justicia
Lun 6,20:15–21:15,RECOVERY ROOM,,—,Salamanca
Lun 6,20:20–21:10,STRENGTH,Glutes,Jesús García,Justicia
Lun 6,20:20–21:10,STRENGTH,Conditioning,Jaime Lorenzo,Salamanca
Lun 6,20:30–21:20,SCULPT,,Carlota Lopez,Justicia
Mar 7,07:00–07:50,STRENGTH,Conditioning,Joris Poels,Justicia
Mar 7,07:00–07:50,STRENGTH,Hombros/Tríceps,Annare Rospligliosi,Salamanca
Mar 7,07:20–08:10,SCULPT,,Amanda Colon,Justicia
Mar 7,08:00–09:00,RECOVERY ROOM,,—,Salamanca
Mar 7,08:05–09:05,RECOVERY ROOM,,—,Justicia
Mar 7,08:10–09:00,STRENGTH,Hombros/Tríceps,Joris Poels,Justicia
Mar 7,08:10–09:00,STRENGTH,Conditioning,Annare Rospligliosi,Salamanca
Mar 7,08:30–09:20,SCULPT,,Alexa Zarain,Justicia
Mar 7,09:15–10:15,RECOVERY ROOM,,—,Justicia
Mar 7,09:15–10:15,RECOVERY ROOM,,—,Salamanca
Mar 7,09:20–10:10,POWER SCULPT,,Amanda Colon,Salamanca
Mar 7,09:20–10:10,POWER SCULPT,,Joris Poels,Justicia
Mar 7,09:40–10:30,SCULPT,,Alexa Zarain,Justicia
Mar 7,10:25–11:25,RECOVERY ROOM,,—,Justicia
Mar 7,10:30–11:30,OPEN GYM,,—,Salamanca
Mar 7,10:30–11:30,OPEN GYM,,—,Justicia
Mar 7,10:30–11:30,RECOVERY ROOM,,—,Salamanca
Mar 7,10:50–11:40,BE TORO METHOD,,Manuela Londoño,Justicia
Mar 7,11:30–12:30,OPEN GYM,,—,Justicia
Mar 7,11:30–12:30,OPEN GYM,,—,Salamanca
Mar 7,11:35–12:35,RECOVERY ROOM,,—,Justicia
Mar 7,11:45–12:45,RECOVERY ROOM,,—,Salamanca
Mar 7,12:20–13:10,SCULPT,,Alma Guerra,Justicia
Mar 7,12:30–13:30,OPEN GYM,,—,Justicia
Mar 7,12:30–13:30,OPEN GYM,,—,Salamanca
Mar 7,12:55–13:55,RECOVERY ROOM,,—,Justicia
Mar 7,13:00–14:00,RECOVERY ROOM,,—,Salamanca
Mar 7,13:30–14:20,STRENGTH,Hombros/Tríceps,Jaime Lorenzo,Salamanca
Mar 7,13:30–14:20,SCULPT,,Alma Guerra,Justicia
Mar 7,14:05–15:05,RECOVERY ROOM,,—,Justicia
Mar 7,14:10–15:00,STRENGTH,Hombros/Tríceps,Pablo Sánchez,Justicia
Mar 7,14:15–15:15,RECOVERY ROOM,,—,Salamanca
Mar 7,14:30–15:30,OPEN GYM,,—,Salamanca
Mar 7,15:15–16:15,RECOVERY ROOM,,—,Justicia
Mar 7,15:15–16:15,OPEN GYM,,—,Justicia
Mar 7,15:30–16:30,OPEN GYM,,—,Salamanca
Mar 7,15:30–16:30,RECOVERY ROOM,,—,Salamanca
Mar 7,17:45–18:45,RECOVERY ROOM,,—,Justicia
Mar 7,17:45–18:45,RECOVERY ROOM,,—,Salamanca
Mar 7,18:00–18:50,HYROX,,Joris Poels,Salamanca
Mar 7,18:00–18:50,POWER SCULPT,,Mia Rapoport,Justicia
Mar 7,18:10–19:00,BE TORO METHOD,,Manuela Londoño,Justicia
Mar 7,19:00–20:00,RECOVERY ROOM,,—,Justicia
Mar 7,19:00–20:00,RECOVERY ROOM,,—,Salamanca
Mar 7,19:10–20:00,STRENGTH,Hombros/Tríceps,Joris Poels,Salamanca
Mar 7,19:10–20:00,HYROX,,Annare Rospligliosi,Justicia
Mar 7,19:20–20:10,SCULPT,,Carlota Lopez,Justicia
Mar 7,19:30–20:30,RUNNING (exterior),,David Martin,Justicia
Mar 7,20:15–21:15,RECOVERY ROOM,,—,Justicia
Mar 7,20:15–21:15,RECOVERY ROOM,,—,Salamanca
Mar 7,20:20–21:10,POWER SCULPT,,Joris Poels,Salamanca
Mar 7,20:20–21:10,STRENGTH,Hombros/Tríceps,Annare Rospligliosi,Justicia
Mar 7,20:30–21:20,SCULPT,,Carlota Lopez,Justicia
Mié 8,07:00–07:50,STRENGTH,Conditioning,Jaime Lorenzo,Justicia
Mié 8,07:00–07:50,STRENGTH,Bíceps/Espalda,Cristobal Pecchio,Salamanca
Mié 8,07:20–08:10,SCULPT,,Marisa Caniego,Justicia
Mié 8,08:00–09:00,RECOVERY ROOM,,—,Salamanca
Mié 8,08:05–09:05,RECOVERY ROOM,,—,Justicia
Mié 8,08:10–09:00,STRENGTH,Bíceps/Espalda,Jaime Lorenzo,Justicia
Mié 8,08:10–09:00,STRENGTH,Conditioning,Cristobal Pecchio,Salamanca
Mié 8,08:30–09:20,SCULPT,,Marisa Caniego,Justicia
Mié 8,09:15–10:15,RECOVERY ROOM,,—,Justicia
Mié 8,09:15–10:15,RECOVERY ROOM,,—,Salamanca
Mié 8,09:20–10:15,HYROX,,Jaime Lorenzo,Justicia
Mié 8,09:20–10:10,POWER SCULPT,,Manuela Londoño,Salamanca
Mié 8,09:40–10:30,SCULPT,,Alexa Zarain,Justicia
Mié 8,10:25–11:25,RECOVERY ROOM,,—,Justicia
Mié 8,10:30–11:20,STRENGTH,Conditioning,Jaime Lorenzo,Justicia
Mié 8,10:30–11:30,OPEN GYM,,—,Salamanca
Mié 8,10:30–11:30,RECOVERY ROOM,,—,Salamanca
Mié 8,10:50–11:40,SCULPT,,Alexa Zarain,Justicia
Mié 8,11:30–12:30,OPEN GYM,,—,Salamanca
Mié 8,11:30–12:30,OPEN GYM,,—,Justicia
Mié 8,11:35–12:35,RECOVERY ROOM,,—,Justicia
Mié 8,11:45–12:45,RECOVERY ROOM,,—,Salamanca
Mié 8,12:20–13:10,SCULPT,,Alma Guerra,Justicia
Mié 8,12:30–13:30,OPEN GYM,,—,Salamanca
Mié 8,12:30–13:30,OPEN GYM,,—,Justicia
Mié 8,12:55–13:55,RECOVERY ROOM,,—,Justicia
Mié 8,13:00–14:00,RECOVERY ROOM,,—,Salamanca
Mié 8,13:30–14:20,STRENGTH,Bíceps/Espalda,Jaime Lorenzo,Salamanca
Mié 8,13:30–14:20,SCULPT,,Alma Guerra,Justicia
Mié 8,14:05–15:05,RECOVERY ROOM,,—,Justicia
Mié 8,14:10–15:00,STRENGTH,Bíceps/Espalda,Joris Poels,Justicia
Mié 8,14:15–15:15,RECOVERY ROOM,,—,Salamanca
Mié 8,14:30–15:30,OPEN GYM,,—,Salamanca
Mié 8,15:15–16:15,RECOVERY ROOM,,—,Justicia
Mié 8,15:15–16:15,OPEN GYM,,—,Justicia
Mié 8,15:30–16:30,OPEN GYM,,—,Salamanca
Mié 8,15:30–16:30,RECOVERY ROOM,,—,Salamanca
Mié 8,16:50–17:40,POWER SCULPT,,Mia Rapoport,Salamanca
Mié 8,17:45–18:45,RECOVERY ROOM,,—,Justicia
Mié 8,17:45–18:45,RECOVERY ROOM,,—,Salamanca
Mié 8,18:00–18:50,HYROX,,Pablo Sánchez,Justicia
Mié 8,18:00–18:50,HYROX,,Annare Rospligliosi,Salamanca
Mié 8,18:10–19:00,SCULPT,,Raquel Monedero,Justicia
Mié 8,19:00–20:00,RECOVERY ROOM,,—,Justicia
Mié 8,19:00–20:00,RECOVERY ROOM,,—,Salamanca
Mié 8,19:10–20:00,STRENGTH,Conditioning,Pablo Sánchez,Justicia
Mié 8,19:10–20:00,STRENGTH,Bíceps/Espalda,Annare Rospligliosi,Salamanca
Mié 8,19:20–20:10,SCULPT,,Raquel Monedero,Justicia
Mié 8,20:15–21:15,RECOVERY ROOM,,—,Justicia
Mié 8,20:15–21:15,RECOVERY SOCIAL CLUB,,—,Salamanca
Mié 8,20:20–21:10,STRENGTH,Bíceps/Espalda,Pablo Sánchez,Justicia
Mié 8,20:20–21:10,STRENGTH,Conditioning,Annare Rospligliosi,Salamanca
Mié 8,20:30–21:20,SCULPT,,Raquel Monedero,Justicia
Jue 9,07:00–07:50,STRENGTH,Glutes,Cristobal Pecchio,Salamanca
Jue 9,08:00–09:00,RECOVERY ROOM,,—,Salamanca
Jue 9,08:05–09:05,RECOVERY ROOM,,—,Justicia
Jue 9,09:15–10:15,RECOVERY ROOM,,—,Salamanca
Jue 9,09:20–10:10,POWER SCULPT,,Amanda Colon,Salamanca
Jue 9,10:30–11:30,OPEN GYM,,—,Salamanca
Jue 9,10:30–11:30,OPEN GYM,,—,Justicia
Jue 9,10:50–11:40,BE TORO METHOD,,Manuela Londoño,Justicia
Jue 9,11:30–12:30,OPEN GYM,,—,Justicia
Jue 9,11:30–12:30,OPEN GYM,,—,Salamanca
Jue 9,12:30–13:30,OPEN GYM,,—,Salamanca
Jue 9,13:30–14:20,SCULPT,,Raquel Monedero,Justicia
Jue 9,14:00–14:50,STRENGTH,Glutes,Pablo Sánchez,Salamanca
Jue 9,14:05–15:05,RECOVERY ROOM,,—,Justicia
Jue 9,14:10–15:00,STRENGTH,Glutes,Joris Poels,Justicia
Jue 9,14:15–15:15,RECOVERY ROOM,,—,Salamanca
Jue 9,15:15–16:15,RECOVERY ROOM,,—,Justicia
Jue 9,15:15–16:15,OPEN GYM,,—,Justicia
Jue 9,15:30–16:30,OPEN GYM,,—,Salamanca
Jue 9,15:30–16:30,RECOVERY ROOM,,—,Salamanca
Jue 9,17:45–18:45,RECOVERY ROOM,,—,Justicia
Jue 9,17:45–18:45,RECOVERY ROOM,,—,Salamanca
Jue 9,18:00–18:50,POWER SCULPT,,Mia Rapoport,Justicia
Jue 9,18:00–18:50,STRENGTH,Conditioning,Annare Rospligliosi,Salamanca
Jue 9,18:10–19:00,BE TORO METHOD,,Manuela Londoño,Justicia
Jue 9,19:00–20:00,RECOVERY ROOM,,—,Justicia
Jue 9,19:00–20:00,RECOVERY ROOM,,—,Salamanca
Jue 9,19:10–20:00,STRENGTH,Conditioning,Jesús García,Justicia
Jue 9,19:10–20:00,STRENGTH,Glutes,Annare Rospligliosi,Salamanca
Jue 9,19:20–20:10,SCULPT,,Alma Guerra,Justicia
Jue 9,20:15–21:15,RECOVERY ROOM,,—,Justicia
Jue 9,20:15–21:15,RECOVERY ROOM,,—,Salamanca
Jue 9,20:20–21:10,HYROX,,Amanda Colon,Justicia
Jue 9,20:20–21:10,POWER SCULPT,,Annare Rospligliosi,Salamanca
Jue 9,20:30–21:20,SCULPT,,Alma Guerra,Justicia
Vie 10,07:00–07:50,HYROX,,Pablo Sánchez,Salamanca
Vie 10,08:00–09:00,RECOVERY ROOM,,—,Salamanca
Vie 10,09:15–10:15,RECOVERY ROOM,,—,Justicia
Vie 10,09:15–10:15,RECOVERY ROOM,,—,Salamanca
Vie 10,09:20–10:10,POWER SCULPT,,Manuela Londoño,Salamanca
Vie 10,10:30–11:30,OPEN GYM,,—,Justicia
Vie 10,10:50–11:40,SCULPT,,Raquel Monedero,Justicia
Vie 10,11:30–12:30,OPEN GYM,,—,Salamanca
Vie 10,11:30–12:30,OPEN GYM,,—,Justicia
Vie 10,12:20–13:10,SCULPT,,Raquel Monedero,Justicia
Vie 10,12:30–13:30,OPEN GYM,,—,Salamanca
Vie 10,12:30–13:30,OPEN GYM,,—,Justicia
Vie 10,13:30–14:20,SCULPT,,Valeria Puleo Guzmán,Justicia
Vie 10,14:00–14:50,STRENGTH,Hombros/Tríceps,Pablo Sánchez,Salamanca
Vie 10,14:05–15:05,RECOVERY ROOM,,—,Justicia
Vie 10,14:10–15:00,STRENGTH,Hombros/Tríceps,Jaime Lorenzo,Justicia
Vie 10,14:15–15:15,RECOVERY ROOM,,—,Salamanca
Vie 10,15:15–16:15,OPEN GYM,,—,Justicia
Vie 10,15:30–16:30,OPEN GYM,,—,Salamanca
Vie 10,15:30–16:30,RECOVERY ROOM,,—,Salamanca
Vie 10,16:35–17:35,RECOVERY ROOM,,—,Justicia
Vie 10,16:45–17:45,RECOVERY ROOM,,—,Salamanca
Vie 10,16:50–17:40,POWER SCULPT,,Amanda Colon,Justicia
Vie 10,16:50–17:40,POWER SCULPT,,Annare Rospligliosi,Salamanca
Vie 10,17:00–17:50,SCULPT,,Carlota Lopez,Justicia
Vie 10,17:50–18:50,RECOVERY ROOM,,—,Justicia
Vie 10,18:00–18:55,HYROX,,Pablo Sánchez,Justicia
Vie 10,18:00–18:50,HYROX,,Javier Alonso,Salamanca
Vie 10,18:00–19:00,RECOVERY ROOM,,—,Salamanca
Vie 10,18:10–19:00,SCULPT,,Carlota Lopez,Justicia
Vie 10,19:05–20:05,RECOVERY ROOM,,—,Justicia
Vie 10,19:15–20:15,RECOVERY SOCIAL CLUB,,—,Salamanca
Sáb 11,09:40–10:30,STRENGTH,Bíceps/Espalda,Pablo Sánchez,Salamanca
Sáb 11,09:40–10:30,HYROX,,Javier Alonso,Justicia
Sáb 11,09:45–10:45,RECOVERY ROOM,,—,Justicia
Sáb 11,09:45–10:45,RECOVERY ROOM,,—,Salamanca
Sáb 11,09:50–10:40,SCULPT,,Raquel Monedero,Justicia
Sáb 11,10:50–11:40,STRENGTH,Conditioning,Pablo Sánchez,Salamanca
Sáb 11,10:50–11:40,STRENGTH,Bíceps/Espalda,Javier Alonso,Justicia
Sáb 11,10:55–11:55,RECOVERY ROOM,,—,Justicia
Sáb 11,11:00–11:50,SCULPT,,Carlota Lopez,Justicia
Sáb 11,11:00–12:00,RECOVERY ROOM,,—,Salamanca
Sáb 11,12:00–12:50,POWER SCULPT,,Manuela Londoño,Salamanca
Sáb 11,12:00–12:50,STRENGTH,Conditioning,Javier Alonso,Justicia
Sáb 11,12:05–13:05,RECOVERY ROOM,,—,Justicia
Sáb 11,12:10–13:00,SCULPT,,Carlota Lopez,Justicia
Sáb 11,12:15–13:15,RECOVERY ROOM,,—,Salamanca
Sáb 11,13:10–14:00,POWER SCULPT,,Amanda Colon,Justicia
Sáb 11,13:10–14:10,HYROX Workshop,,Pepe Salama,Salamanca
Sáb 11,13:15–14:15,RECOVERY ROOM,,—,Justicia
Sáb 11,13:20–14:10,SCULPT,,Carlota Lopez,Justicia
Sáb 11,13:30–14:30,RECOVERY ROOM,,—,Salamanca
Dom 12,09:40–10:30,STRENGTH,Conditioning,Manfredi Giordano,Justicia
Dom 12,09:45–10:45,RECOVERY ROOM,,—,Justicia
Dom 12,09:50–10:40,SCULPT,,Marisa Caniego,Justicia
Dom 12,10:10–11:10,RECOVERY ROOM,,—,Salamanca
Dom 12,10:30–11:20,STRENGTH,Fullbody,Manuela Londoño,Salamanca
Dom 12,10:50–11:40,STRENGTH,Fullbody,Manfredi Giordano,Justicia
Dom 12,10:55–11:55,RECOVERY ROOM,,—,Justicia
Dom 12,11:00–11:50,SCULPT,,Marisa Caniego,Justicia
Dom 12,11:25–12:25,RECOVERY ROOM,,—,Salamanca
Dom 12,11:40–12:30,STRENGTH,Conditioning,Manuela Londoño,Salamanca
Dom 12,12:00–12:50,STRENGTH,Conditioning,Manfredi Giordano,Justicia
Dom 12,12:05–13:05,RECOVERY ROOM,,—,Justicia
Dom 12,12:10–13:00,SCULPT,,Marisa Caniego,Justicia
Dom 12,12:40–13:40,RECOVERY ROOM,,—,Salamanca
Dom 12,12:50–13:40,POWER SCULPT,,Manuela Londoño,Salamanca
Dom 12,13:10–14:00,POWER SCULPT,,Mia Rapoport,Justicia
Dom 12,13:15–14:15,RECOVERY ROOM,,—,Justicia
Dom 12,13:55–14:55,RECOVERY ROOM,,—,Salamanca
Dom 12,17:00–18:00,OPEN GYM,,—,Salamanca
Dom 12,17:00–18:00,RECOVERY ROOM,,—,Justicia
Dom 12,17:00–18:00,RECOVERY ROOM,,—,Salamanca
Dom 12,18:00–19:00,OPEN GYM,,—,Salamanca
Dom 12,18:10–19:10,RECOVERY ROOM,,—,Justicia
Dom 12,18:15–19:15,RECOVERY ROOM,,—,Salamanca`;

const lines = rawData.trim().split('\n');
const values: string[] = [];

for (const line of lines) {
  const parts = line.split(',');
  const day = parts[0];
  const timeRange = parts[1];
  const className = parts[2];
  const subcategory = parts[3] || '';
  const instructor = parts[4];
  const sede = parts[5];

  const date = DAY_MAP[day];
  if (!date) throw new Error(`Unknown day: "${day}"`);

  const [startTime, endTime] = timeRange.split('–');

  const classTypeId = getClassTypeId(className);
  const coachId = getCoachId(instructor, sede);
  const roomId = getRoomId(sede, className);
  const tag = getTag(className, subcategory);

  const startsAt = `'${date} ${startTime}:00+02'::timestamptz`;
  const endsAt = `'${date} ${endTime}:00+02'::timestamptz`;

  values.push(
    `(gen_random_uuid()::text, '${classTypeId}', '${coachId}', '${roomId}', '${TENANT_ID}', ${startsAt}, ${endsAt}, 'SCHEDULED', false, ${escapeSQL(tag)}, true, ARRAY['ALL'])`
  );
}

console.log(`-- Total classes: ${values.length}`);
console.log(`-- Generated on: ${new Date().toISOString()}\n`);

const BATCH_SIZE = 60;
for (let i = 0; i < values.length; i += BATCH_SIZE) {
  const batch = values.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  console.log(`-- BATCH ${batchNum} (${batch.length} classes)`);
  console.log(`INSERT INTO "Class" (id, "classTypeId", "coachId", "roomId", "tenantId", "startsAt", "endsAt", status, "isRecurring", tag, "songRequestsEnabled", "songRequestCriteria") VALUES`);
  console.log(batch.join(',\n') + ';\n');
}
