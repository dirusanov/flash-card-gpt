export const SET_ANKI_AVAILABILITY = 'SET_ANKI_AVAILABILITY';

export const setAnkiAvailability = (isAvailable: boolean) => ({
  type: SET_ANKI_AVAILABILITY,
  payload: isAvailable,
});
