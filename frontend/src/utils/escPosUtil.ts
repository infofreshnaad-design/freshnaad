/**
 * Minimal ESC/POS Builder for Thermal Printers
 * Supports basic text, alignment, and formatting
 */
export class EscPosBuilder {
  private buffer: number[] = [];
  private encoder = new TextEncoder();

  constructor() {
    this.init();
  }

  private init() {
    this.buffer.push(0x1B, 0x40); // Initialize printer
    return this;
  }

  text(str: string) {
    const bytes = this.encoder.encode(str);
    this.buffer.push(...Array.from(bytes));
    return this;
  }

  line(str: string = '') {
    this.text(str + '\n');
    return this;
  }

  alignCenter() {
    this.buffer.push(0x1B, 0x61, 0x01);
    return this;
  }

  alignLeft() {
    this.buffer.push(0x1B, 0x61, 0x00);
    return this;
  }

  alignRight() {
    this.buffer.push(0x1B, 0x61, 0x02);
    return this;
  }

  bold(on: boolean = true) {
    this.buffer.push(0x1B, 0x45, on ? 0x01 : 0x00);
    return this;
  }

  doubleSize(on: boolean = true) {
    this.buffer.push(0x1B, 0x21, on ? 0x30 : 0x00);
    return this;
  }

  feed(lines: number = 3) {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0A);
    }
    return this;
  }

  cut() {
    this.buffer.push(0x1D, 0x56, 0x42, 0x00);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * Helper to format an Order object into a receipt
   */
  static generateReceipt(order: any, businessInfo: any): Uint8Array {
    const builder = new EscPosBuilder();
    
    // Header
    builder.alignCenter()
           .doubleSize(true)
           .bold(true)
           .line('FRESH NAAD FOODS INDIA')
           .doubleSize(false)
           .bold(false)
           .line('Kodassery, Pandikkad (po)')
           .line('Malappuram, Kerala')
           .alignLeft()
           .line('FSSAI: 21326222000253')
           .alignRight()
           .line('Mob: 8606391315, 75608 57580')
           .alignCenter()
           .line('--------------------------------');

    // Order Info
    builder.alignLeft()
           .line(`Bill No: ${order.invoiceNo || 'N/A'}`)
           .line(`Date: ${new Date(order.createdAt || Date.now()).toLocaleString()}`)
           .line(`Cust: ${order.customer?.name || order.customerName || 'Walk-in'}`)
           .line('--------------------------------');

    // Items Header (6 cols: #, Desc, Qty, KRP, MRP, Total)
    builder.bold(true)
           .line('#  Description       Qty   MRP   Total')
           .bold(false);

    // Items
    (order.orderItems || []).forEach((item: any, idx: number) => {
      const slNo = (idx + 1).toString().padEnd(3);
      const name = (item.product?.name || item.name || 'Item').substring(0, 15).padEnd(16);
      const qty = (Number(item.quantity) || 0).toFixed(1).padStart(5);
      const mrp = (Number(item.mrp || item.product?.mrp || item.price || 0)).toFixed(0).padStart(5);
      const total = (Number(item.total) || 0).toFixed(0).padStart(6);
      builder.line(`${slNo}${name}${qty}${mrp}${total}`);
    });

    builder.line('--------------------------------');

    // Totals
    builder.alignRight()
           .bold(true)
           .doubleSize(true)
           .line(`TOTAL: ${order.grandTotal.toFixed(2)}`)
           .doubleSize(false)
           .bold(false);

    builder.alignCenter()
           .feed(1)
           .line('Thank you for shopping!')
           .line('Digital Bill by POS Pro')
           .bold(true)
           .line('Software by NIVAN SOLUTIONS')
           .bold(false)
           .feed(3)
           .cut();

    return builder.build();
  }
}
