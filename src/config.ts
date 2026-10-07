// Site-wide settings. Most edits to the website happen in `src/data/` and
// `src/content/`; this file holds the few values that appear on every page.

export const site = {
  name: 'KI-FOR 5339',
  title: 'AI-based Methodology for the Fast Maturation of Immature Manufacturing Processes',
  shortTitle: 'Fast Maturation of Manufacturing Processes',
  description:
    'DFG Research Unit KI-FOR 5339 at the Karlsruhe Institute of Technology and Fraunhofer IOSB. We combine experiments, simulation, learning, optimisation and control, aiming to mature new manufacturing processes with fewer physical trials.',
  lang: 'en-GB',
};

export const funding = {
  funder: 'Deutsche Forschungsgemeinschaft (DFG, German Research Foundation)',
  projectNumber: '459291153',
  gepris: 'https://gepris.dfg.de/gepris/projekt/459291153',
};

export const nav = [
  { href: '/research/', label: 'Research' },
  { href: '/subprojects/', label: 'Subprojects' },
  { href: '/team/', label: 'Team' },
  { href: '/publications/', label: 'Publications' },
  { href: '/news/', label: 'News' },
  { href: '/contact/', label: 'Contact' },
];

export const partners = [
  { name: 'Karlsruhe Institute of Technology (KIT)', href: 'https://www.kit.edu/english/' },
  { name: 'Fraunhofer IOSB', href: 'https://www.iosb.fraunhofer.de/en.html' },
  { name: 'Karlsruhe Research Factory', href: 'https://www.karlsruher-forschungsfabrik.de/en.html' },
];
