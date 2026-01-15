import { EventEmitter } from 'events'
import { uIOhook, UiohookKey } from 'uiohook-napi'

export class InputMonitor extends EventEmitter {
  private lastMouseX: number = 0
  private lastMouseY: number = 0
  private isRunning: boolean = false

  private activeModifiers: Set<number> = new Set()
  private modifierUsed: Set<number> = new Set() // 标记修饰键是否参与了组合

  constructor() {
    super()
    this.setupHooks()
  }

  private isModifier(keycode: number): boolean {
    return ([
      UiohookKey.Ctrl, UiohookKey.CtrlRight,
      UiohookKey.Alt, UiohookKey.AltRight,
      UiohookKey.Shift, UiohookKey.ShiftRight,
      UiohookKey.Meta, UiohookKey.MetaRight
    ] as number[]).includes(keycode)
  }

  private getModifierName(keycode: number): string {
    if (keycode === UiohookKey.Ctrl || keycode === UiohookKey.CtrlRight) return 'Ctrl'
    if (keycode === UiohookKey.Alt || keycode === UiohookKey.AltRight) return 'Alt'
    if (keycode === UiohookKey.Shift || keycode === UiohookKey.ShiftRight) return 'Shift'
    if (keycode === UiohookKey.Meta || keycode === UiohookKey.MetaRight) return 'Win'
    return ''
  }

  private getComboName(currentKey: number): string {
    const modifiers: string[] = []
    const active = Array.from(this.activeModifiers)

    // 按照 Win -> Ctrl -> Alt -> Shift 的顺序排序
    if (active.some(k => k === UiohookKey.Meta || k === UiohookKey.MetaRight)) modifiers.push('Win')
    if (active.some(k => k === UiohookKey.Ctrl || k === UiohookKey.CtrlRight)) modifiers.push('Ctrl')
    if (active.some(k => k === UiohookKey.Alt || k === UiohookKey.AltRight)) modifiers.push('Alt')
    if (active.some(k => k === UiohookKey.Shift || k === UiohookKey.ShiftRight)) modifiers.push('Shift')

    const keyName = getKeyName(currentKey)
    return [...modifiers, keyName].join(' + ')
  }

  private setupHooks(): void {
    // 键盘按下事件
    uIOhook.on('keydown', (e) => {
      const keycode = e.keycode

      if (this.isModifier(keycode)) {
        this.activeModifiers.add(keycode)
        return // 修饰键按下时不立即触发，等待后续判断
      }

      // 如果有修饰键按下，则构成组合键
      if (this.activeModifiers.size > 0) {
        // 标记所有当前按下的修饰键为"已使用"
        this.activeModifiers.forEach(m => this.modifierUsed.add(m))

        const comboName = this.getComboName(keycode)
        this.emit('combo', comboName)
      } else {
        // 普通按键
        this.emit('keydown', keycode)
      }
    })

    // 键盘释放事件
    uIOhook.on('keyup', (e) => {
      const keycode = e.keycode

      if (this.isModifier(keycode)) {
        // 如果该修饰键没有参与过组合，则在释放时算作一次单独点击
        if (!this.modifierUsed.has(keycode)) {
          this.emit('keydown', keycode)
        }

        // 清理状态
        this.activeModifiers.delete(keycode)
        this.modifierUsed.delete(keycode)
      } else {
        // 普通按键释放，不需要特殊处理
      }
    })

    // 鼠标按下事件
    uIOhook.on('mousedown', (e) => {
      // button: 1=左键, 2=右键, 3=中键
      this.emit('mousedown', e.button)
    })

    // 鼠标移动事件
    uIOhook.on('mousemove', (e) => {
      this.emit('mousemove', e.x, e.y)
    })

    // 鼠标滚轮事件
    uIOhook.on('wheel', (e) => {
      // rotation: 滚动方向和距离
      const delta = Math.abs(e.rotation) * 3 // 每次滚动约3个像素单位
      this.emit('wheel', delta)
    })
  }

  start(): void {
    if (this.isRunning) return

    try {
      uIOhook.start()
      this.isRunning = true
      console.log('[InputMonitor] Started successfully')
    } catch (error) {
      console.error('[InputMonitor] Failed to start:', error)
    }
  }

  stop(): void {
    if (!this.isRunning) return

    try {
      uIOhook.stop()
      this.isRunning = false
      console.log('[InputMonitor] Stopped')
    } catch (error) {
      console.error('[InputMonitor] Failed to stop:', error)
    }
  }
}

// 键码到键名的映射表（常用按键）
export const KeyCodeMap: Record<number, string> = {
  // 功能键
  [UiohookKey.Escape]: 'Esc',
  [UiohookKey.F1]: 'F1',
  [UiohookKey.F2]: 'F2',
  [UiohookKey.F3]: 'F3',
  [UiohookKey.F4]: 'F4',
  [UiohookKey.F5]: 'F5',
  [UiohookKey.F6]: 'F6',
  [UiohookKey.F7]: 'F7',
  [UiohookKey.F8]: 'F8',
  [UiohookKey.F9]: 'F9',
  [UiohookKey.F10]: 'F10',
  [UiohookKey.F11]: 'F11',
  [UiohookKey.F12]: 'F12',

  // 数字键
  [UiohookKey['1']]: '1',
  [UiohookKey['2']]: '2',
  [UiohookKey['3']]: '3',
  [UiohookKey['4']]: '4',
  [UiohookKey['5']]: '5',
  [UiohookKey['6']]: '6',
  [UiohookKey['7']]: '7',
  [UiohookKey['8']]: '8',
  [UiohookKey['9']]: '9',
  [UiohookKey['0']]: '0',

  // 字母键
  [UiohookKey.A]: 'A',
  [UiohookKey.B]: 'B',
  [UiohookKey.C]: 'C',
  [UiohookKey.D]: 'D',
  [UiohookKey.E]: 'E',
  [UiohookKey.F]: 'F',
  [UiohookKey.G]: 'G',
  [UiohookKey.H]: 'H',
  [UiohookKey.I]: 'I',
  [UiohookKey.J]: 'J',
  [UiohookKey.K]: 'K',
  [UiohookKey.L]: 'L',
  [UiohookKey.M]: 'M',
  [UiohookKey.N]: 'N',
  [UiohookKey.O]: 'O',
  [UiohookKey.P]: 'P',
  [UiohookKey.Q]: 'Q',
  [UiohookKey.R]: 'R',
  [UiohookKey.S]: 'S',
  [UiohookKey.T]: 'T',
  [UiohookKey.U]: 'U',
  [UiohookKey.V]: 'V',
  [UiohookKey.W]: 'W',
  [UiohookKey.X]: 'X',
  [UiohookKey.Y]: 'Y',
  [UiohookKey.Z]: 'Z',

  // 修饰键
  [UiohookKey.Shift]: 'Shift',
  [UiohookKey.ShiftRight]: 'Shift',
  [UiohookKey.Ctrl]: 'Ctrl',
  [UiohookKey.CtrlRight]: 'Ctrl',
  [UiohookKey.Alt]: 'Alt',
  [UiohookKey.AltRight]: 'Alt',
  [UiohookKey.Meta]: 'Win',
  [UiohookKey.MetaRight]: 'Win',

  // 特殊键
  [UiohookKey.Space]: 'Space',
  [UiohookKey.Tab]: 'Tab',
  [UiohookKey.Enter]: 'Enter',
  [UiohookKey.Backspace]: 'Backspace',
  [UiohookKey.Delete]: 'Delete',
  [UiohookKey.Insert]: 'Insert',
  [UiohookKey.Home]: 'Home',
  [UiohookKey.End]: 'End',
  [UiohookKey.PageUp]: 'PageUp',
  [UiohookKey.PageDown]: 'PageDown',
  [UiohookKey.CapsLock]: 'CapsLock',

  // 方向键
  [UiohookKey.ArrowUp]: '↑',
  [UiohookKey.ArrowDown]: '↓',
  [UiohookKey.ArrowLeft]: '←',
  [UiohookKey.ArrowRight]: '→',

  // 符号键
  [UiohookKey.Minus]: '-',
  [UiohookKey.Equal]: '=',
  [UiohookKey.BracketLeft]: '[',
  [UiohookKey.BracketRight]: ']',
  [UiohookKey.Backslash]: '\\',
  [UiohookKey.Semicolon]: ';',
  [UiohookKey.Quote]: "'",
  [UiohookKey.Backquote]: '`',
  [UiohookKey.Comma]: ',',
  [UiohookKey.Period]: '.',
  [UiohookKey.Slash]: '/',
}

export function getKeyName(keycode: number): string {
  return KeyCodeMap[keycode] || `Key${keycode}`
}
