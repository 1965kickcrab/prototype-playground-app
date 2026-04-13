export function initState(initialReservations = [], options = {}) {
  return {
    currentDate: new Date(),
    selectedDate: new Date(),
    reservations: Array.isArray(initialReservations) ? [...initialReservations] : [],
    selectedServices: options.selectedServices || {
      school: true,
      daycare: true,
    },
    defaultService: options.defaultService || "",
    serviceOptions: Array.isArray(options.serviceOptions) ? options.serviceOptions : [],
    selectedTeachers: options.selectedTeachers || {},
    teacherOptions: Array.isArray(options.teacherOptions) ? options.teacherOptions : [],
    selectedPaymentStatuses: options.selectedPaymentStatuses || {
      paid: true,
      unpaid: true,
    },
    paymentStatusOptions: Array.isArray(options.paymentStatusOptions)
      ? options.paymentStatusOptions
      : ["paid", "unpaid"],
    selectedTags: options.selectedTags || {},
    tagOptions: Array.isArray(options.tagOptions) ? options.tagOptions : [],
    classTeachers: options.classTeachers || {},
  };
}
