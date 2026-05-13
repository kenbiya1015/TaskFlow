export const MEMBERS = [
  { id: 'shimura',  name: '志村直紀', role: '代表 / プランナー',   initial: '志', color: '#2f6fed' },
  { id: 'furusawa', name: '古澤',     role: '運営 / 実務担当',     initial: '古', color: '#1f9e6a' },
  { id: 'arino',    name: '有野',     role: 'サポート / 施術担当', initial: '有', color: '#d97706' },
]

export const MEMBER_NAMES = MEMBERS.map(m => m.name)

export const findMember = nameOrId =>
  MEMBERS.find(m => m.name === nameOrId || m.id === nameOrId)
