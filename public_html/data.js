/**
 * Configuración oficial de cursos por etapa educativa.
 * Los datos médicos y de alumnado residen exclusivamente en la base de datos protegida Firestore.
 */
export const DEFAULT_COURSES = {
    "Infantil": ["1º Infantil", "2º Infantil", "3º Infantil"],
    "Primaria": ["1º Primaria", "2º Primaria", "3º Primaria", "4º Primaria", "5º Primaria", "6º Primaria"],
    "ESO": ["1º ESO", "2º ESO", "3º ESO", "4º ESO"]
};

// Plantilla base sin datos personales de alumnos
export const schoolData = {
    "Infantil": {},
    "Primaria": {},
    "ESO": {}
};
