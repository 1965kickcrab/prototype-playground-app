/**
 * hoteling-reservation-service.js
 * - Build and query hoteling reservation date entries
 * - Provide calendar stats, disabled-date rules, and night calculations
 * Scope: pure domain logic (no storage, no UI)
 */
import { getDateKeyFromParts, getDatePartsFromKey, getZonedParts, sortDateKeys } from "../utils/date.js";
import { getTimeZone } from "../utils/timezone.js";
import { getIssuedTicketOptions } from "./ticket-reservation-service.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import {
    getDefaultLinkedTicketSelection,
    getLinkedTargetKeysBySelection,
} from "./ticket-linking.js";

const { STATUS } = initReservationStorage();
export { STATUS };

/**
 * Calculates the number of nights based on the first and last date in a reservation's dates array.
 * @param {object} reservation - The unified reservation object.
 * @returns {number} The number of nights.
 */
export function getNightCountFromReservation(reservation) {
    if (!reservation || !Array.isArray(reservation.dates) || reservation.dates.length < 2) {
        return 0;
    }
    const sortedDates = sortDateKeys(reservation.dates.map(d => d.date));
    const checkinKey = sortedDates[0];
    const checkoutKey = sortedDates[sortedDates.length - 1];
    
    const startParts = getDatePartsFromKey(checkinKey);
    const endParts = getDatePartsFromKey(checkoutKey);
    if (!startParts || !endParts) return 0;

    const startDate = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
    const endDate = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
    
    const diff = Math.round((endDate - startDate) / 86400000);
    return Math.max(0, diff);
}

export function getHotelingDateKey(date, timeZone = getTimeZone()) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
    }
    const parts = getZonedParts(date, timeZone);
    return getDateKeyFromParts(parts);
}

/**
 * Builds the `dates` array for a new hoteling reservation.
 * @param {string} checkinDate - YYYY-MM-DD
 * @param {string} checkoutDate - YYYY-MM-DD
 * @param {string} checkinTime - HH:mm
 * @param {string} checkoutTime - HH:mm
 * @returns {Array} The array of date entries.
 */
export function buildHotelingDateEntries(checkinDate, checkoutDate, checkinTime, checkoutTime) {
    const entries = [];
    const startDate = getDatePartsFromKey(checkinDate);
    const endDate = getDatePartsFromKey(checkoutDate);
    if (!startDate || !endDate) return entries;
    
    const start = new Date(Date.UTC(startDate.year, startDate.month - 1, startDate.day));
    const end = new Date(Date.UTC(endDate.year, endDate.month - 1, endDate.day));
    if (end < start) return entries;

    const dateKeys = [];
    let currentDate = start;
    while (currentDate <= end) {
        dateKeys.push(getDateKeyFromParts({ year: currentDate.getUTCFullYear(), month: currentDate.getUTCMonth() + 1, day: currentDate.getUTCDate() }));
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    if (dateKeys.length === 0) return entries;

    if (dateKeys.length === 1) {
        const key = dateKeys[0];
        entries.push({
            date: key,
            kind: 'checkin',
            checkinTime: checkinTime || null,
            checkoutTime: null,
            time: checkinTime || null,
            status: STATUS.PLANNED,
            pickup: false,
            dropoff: false,
            ticketUsages: [],
        });
        entries.push({
            date: key,
            kind: 'checkout',
            checkinTime: null,
            checkoutTime: checkoutTime || null,
            time: checkoutTime || null,
            status: STATUS.PLANNED,
            pickup: false,
            dropoff: false,
            ticketUsages: [],
        });
        return entries;
    }

    dateKeys.forEach((dateKey, index) => {
        const status = STATUS.PLANNED;
        if (index === 0) {
            entries.push({
                date: dateKey,
                kind: 'checkin',
                checkinTime: checkinTime || null,
                checkoutTime: null,
                time: checkinTime || null,
                status,
                pickup: false,
                dropoff: false,
                ticketUsages: [],
            });
        } else if (index === dateKeys.length - 1) {
            entries.push({
                date: dateKey,
                kind: 'checkout',
                checkinTime: null,
                checkoutTime: checkoutTime || null,
                time: checkoutTime || null,
                status,
                pickup: false,
                dropoff: false,
                ticketUsages: [],
            });
        } else {
            entries.push({
                date: dateKey,
                kind: 'stay',
                checkinTime: null,
                checkoutTime: null,
                time: null,
                status,
                pickup: false,
                dropoff: false,
                ticketUsages: [],
            });
        }
    });

    return entries;
}

export function getHotelingReservationSummary(reservations) {
    const summary = {
        reservedKeys: new Set(),
        checkinKeys: new Set(),
        checkoutKeys: new Set(),
    };

    const hotelingReservations = reservations.filter(r => r.type === 'hoteling');

    for (const reservation of hotelingReservations) {
        for (const entry of reservation.dates) {
            if (entry.status === STATUS.CANCELED) continue;
            
            summary.reservedKeys.add(entry.date);
            if (entry.kind === "checkin") {
                summary.checkinKeys.add(entry.date);
            }
            if (entry.kind === "checkout") {
                summary.checkoutKeys.add(entry.date);
            }
        }
    }
    return summary;
}

export function getHotelingCalendarStats(reservations) {
    const statsMap = new Map();
    const hotelingReservations = reservations.filter(r => r.type === 'hoteling');

    for (const reservation of hotelingReservations) {
        for (const entry of reservation.dates) {
            if (entry.status === STATUS.CANCELED) continue;

            const current = statsMap.get(entry.date) || { total: 0, checkin: 0, checkout: 0, stay: 0 };
            current.total++;
            if (entry.kind === "checkin") current.checkin++;
            else if (entry.kind === "checkout") current.checkout++;
            else current.stay++;
            statsMap.set(entry.date, current);
        }
    }
    return statsMap;
}

export function getNextHotelingCheckinKey(checkinKey, checkinKeys) {
    if (!checkinKey || !(checkinKeys instanceof Set)) return "";
    const candidates = sortDateKeys(Array.from(checkinKeys).filter((key) => key > checkinKey));
    return candidates[0] || "";
}

export function isHotelingDateDisabled({ dateKey, reservedKeys, checkinKeys, checkoutKeys, checkinKey, checkoutKey, nextCheckinKey }) {
    if (!dateKey) return false;
    if (reservedKeys.has(dateKey)) {
        if (!checkinKeys.has(dateKey) && !checkoutKeys.has(dateKey)) return true;
    }
    if (checkinKey && !checkoutKey) {
        if (nextCheckinKey && dateKey >= nextCheckinKey) return true;
    }
    return false;
}

function normalizeRoomId(value) {
    const raw = String(value || "");
    if (!raw) return "";
    if (raw.includes(":")) {
        const [, id] = raw.split(":");
        return id || "";
    }
    return raw;
}

export function getHotelingTicketOptions(tickets, memberTickets) {
    const options = getIssuedTicketOptions(tickets, memberTickets);
    return options.filter(
        (option) =>
            option.type === "hoteling"
            && Number(option?.reservableCount) > 0
    );
}

export function getDefaultHotelingTicketSelection(rooms, ticketOptions) {
    return getDefaultLinkedTicketSelection(
        rooms,
        ticketOptions,
        (room) => room?.ticketIds
    );
}

export function getEligibleHotelingTicketOptions(rooms, ticketOptions, roomId) {
    const optionList = Array.isArray(ticketOptions) ? ticketOptions : [];
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId || optionList.length === 0) {
        return optionList;
    }

    const room = (Array.isArray(rooms) ? rooms : []).find(
        (item) => normalizeRoomId(item?.id) === normalizedRoomId
    );
    const ticketIds = Array.isArray(room?.ticketIds) ? room.ticketIds : [];
    if (ticketIds.length === 0) {
        return optionList;
    }

    const ticketIdSet = new Set(ticketIds.map((ticketId) => String(ticketId ?? "")));
    return optionList.filter((option) =>
        ticketIdSet.has(String(option?.ticketId ?? ""))
    );
}

export function getHotelingRoomIdsForTickets(rooms, ticketOptions, selectionOrder) {
    return getLinkedTargetKeysBySelection(
        rooms,
        ticketOptions,
        selectionOrder,
        {
            getTicketIds: (room) => room?.ticketIds,
            getTargetKey: (room) => normalizeRoomId(room?.id),
        }
    );
}

export function buildHotelingEntriesForDate(reservations, dateKey, options = {}) {
    const groups = { checkin: [], checkout: [], stay: [] };
    if (!dateKey) return groups;
    const includeCanceled = Boolean(options?.includeCanceled);

    const hotelingReservations = reservations.filter(r => r.type === 'hoteling');

    for (const reservation of hotelingReservations) {
        for (const entry of reservation.dates) {
            if (entry.date !== dateKey) continue;
            if (!includeCanceled && entry.status === STATUS.CANCELED) continue;
            
            const groupEntry = { reservation, entry };
            if (entry.kind === "checkin") groups.checkin.push(groupEntry);
            else if (entry.kind === "checkout") groups.checkout.push(groupEntry);
            else groups.stay.push(groupEntry);
        }
    }
    return groups;
}

export function getHotelingNightKeys(checkin, checkout, timeZone = getTimeZone()) {
    if (!checkin || !checkout || !(checkin instanceof Date) || !(checkout instanceof Date)) {
        return [];
    }
    if (checkin >= checkout) {
        return [];
    }

    const nightKeys = [];
    let currentDate = new Date(checkin);

    while (currentDate < checkout) {
        const dateKey = getHotelingDateKey(currentDate, timeZone);
        if (dateKey) {
            nightKeys.push(dateKey);
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return nightKeys;
}
