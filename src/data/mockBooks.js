// Mock library entries backed by placeholder cover images in
// src/assets/mockcovers/. These render in the My Library shelves
// (Recent + All Books) for visual seeding only — no reader content.
//
// Each entry sets:
//   - lastOpenedAt: a recent millisecond timestamp so the entry
//     surfaces in the Recent shelf, staggered so the order is stable.
//   - progress: 0, so the entry is excluded from Continue Reading.
//   - isMock: true, so handleOpenBook can no-op and so future filters
//     can distinguish mocks from real Firestore-backed books.

import elCuartoDeLasVoces from '../assets/mockcovers/El cuarto de las voces.png'
import elFaroDePuntaLobos from '../assets/mockcovers/El faro de Punta Lobos.png'
import elFondo from '../assets/mockcovers/El fondo.png'
import laColoniaEsperanza from '../assets/mockcovers/La colonia Esperanza.png'
import volverACartagena from '../assets/mockcovers/Volver a Categena.png'
import bodasYUnFuneral from '../assets/mockcovers/bodas y un funeral.png'
import casaEnLaColina from '../assets/mockcovers/casa en la colina.png'
import lasCartasOlvidadas from '../assets/mockcovers/download.png'
import folkTale from '../assets/mockcovers/folk tale.png'
import laListaDeLucia from '../assets/mockcovers/la lksta de lucia.png'
import laParedDeEnfrente from '../assets/mockcovers/la pared enfrente.png'
import lasQueMiran from '../assets/mockcovers/las que miran.png'
import onceDias from '../assets/mockcovers/once dias.png'

// Use a fixed reference so order is stable across renders.
const NOW = Date.now()
const minuteAgo = (n) => NOW - n * 60_000

const SPANISH_MOCKS = [
  {
    id: 'mock-el-cuarto-de-las-voces',
    title: 'El Cuarto de las Voces',
    author: 'Marta Ríos',
    level: 'Intermediate',
    pageCount: 248,
    coverImageUrl: elCuartoDeLasVoces,
    lastOpenedAt: minuteAgo(1),
  },
  {
    id: 'mock-el-faro-de-punta-lobos',
    title: 'El Faro de Punta Lobos',
    author: 'Alejandro Vega',
    level: 'Beginner',
    pageCount: 156,
    coverImageUrl: elFaroDePuntaLobos,
    lastOpenedAt: minuteAgo(2),
  },
  {
    id: 'mock-el-fondo',
    title: 'El Fondo',
    author: 'Carmen Soler',
    level: 'Advanced',
    pageCount: 312,
    coverImageUrl: elFondo,
    lastOpenedAt: minuteAgo(3),
  },
  {
    id: 'mock-la-colonia-esperanza',
    title: 'La Colonia Esperanza',
    author: 'Diego Alarcón',
    level: 'Intermediate',
    pageCount: 280,
    coverImageUrl: laColoniaEsperanza,
    lastOpenedAt: minuteAgo(4),
  },
  {
    id: 'mock-volver-a-cartagena',
    title: 'Volver a Cartagena',
    author: 'Lucía Méndez',
    level: 'Beginner',
    pageCount: 184,
    coverImageUrl: volverACartagena,
    lastOpenedAt: minuteAgo(5),
  },
  {
    id: 'mock-tres-bodas-y-un-funeral-equivocado',
    title: 'Tres Bodas y un Funeral Equivocado',
    author: 'Esteban Ferrer',
    level: 'Intermediate',
    pageCount: 224,
    coverImageUrl: bodasYUnFuneral,
    lastOpenedAt: minuteAgo(6),
  },
  {
    id: 'mock-la-casa-en-la-colina',
    title: 'La Casa en la Colina',
    author: 'Ana Castellanos',
    level: 'Advanced',
    pageCount: 356,
    coverImageUrl: casaEnLaColina,
    lastOpenedAt: minuteAgo(7),
  },
  {
    id: 'mock-las-cartas-olvidadas',
    title: 'Las Cartas Olvidadas',
    author: 'Pablo Mendizábal',
    level: 'Intermediate',
    pageCount: 196,
    coverImageUrl: lasCartasOlvidadas,
    lastOpenedAt: minuteAgo(8),
  },
  {
    id: 'mock-cuento-popular',
    title: 'Cuento Popular',
    author: 'Inés Montero',
    level: 'Beginner',
    pageCount: 92,
    coverImageUrl: folkTale,
    lastOpenedAt: minuteAgo(9),
  },
  {
    id: 'mock-la-lista-de-lucia',
    title: 'La Lista de Lucía',
    author: 'Rafael Pereda',
    level: 'Advanced',
    pageCount: 268,
    coverImageUrl: laListaDeLucia,
    lastOpenedAt: minuteAgo(10),
  },
  {
    id: 'mock-la-pared-de-enfrente',
    title: 'La Pared de Enfrente',
    author: 'Sofía Cabral',
    level: 'Intermediate',
    pageCount: 212,
    coverImageUrl: laParedDeEnfrente,
    lastOpenedAt: minuteAgo(11),
  },
  {
    id: 'mock-las-que-miran',
    title: 'Las Que Miran',
    author: 'Tomás Quintana',
    level: 'Advanced',
    pageCount: 304,
    coverImageUrl: lasQueMiran,
    lastOpenedAt: minuteAgo(12),
  },
  {
    id: 'mock-once-dias',
    title: 'Once Días',
    author: 'Valeria Ortiz',
    level: 'Beginner',
    pageCount: 128,
    coverImageUrl: onceDias,
    lastOpenedAt: minuteAgo(13),
  },
].map((entry) => ({
  ...entry,
  language: 'Spanish',
  progress: 0,
  isMock: true,
}))

export const MOCK_BOOKS = [...SPANISH_MOCKS]

export function mockBooksForLanguage(language) {
  return MOCK_BOOKS.filter((book) => book.language === language)
}
