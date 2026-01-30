export function initState(initialReservations = [], options = {}) {
  return {
    currentDate: new Date(),
    selectedDate: new Date(),
    reservations: Array.isArray(initialReservations) ? [...initialReservations] : [],
    selectedServices: options.selectedServices || {
      kindergarten: true,
      daycare: true,
    },
    defaultService: options.defaultService || "",
    serviceOptions: Array.isArray(options.serviceOptions) ? options.serviceOptions : [],
    selectedTeachers: options.selectedTeachers || {},
    teacherOptions: Array.isArray(options.teacherOptions) ? options.teacherOptions : [],
    classTeachers: options.classTeachers || {},
  };
}
