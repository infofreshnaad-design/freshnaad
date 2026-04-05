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
           .line(businessInfo.name || 'POS BILLING')
           .doubleSize(false)
           .bold(false)
           .line(businessInfo.address || '')
           .line(businessInfo.phone ? `Ph: ${businessInfo.phone}` : '')
           .line('--------------------------------');

    // Order Info
    builder.alignLeft()
           .line(`Bill No: ${order.invoiceNo}`)
           .line(`Date: ${new Date(order.createdAt).toLocaleString()}`)
           .line(`Customer: ${order.customer?.name || 'Walk-in'}`)
           .line('--------------------------------');

    // Items Header
    builder.bold(true)
           .line('Item           Qty    Price    Total')
           .bold(false);

    // Items
    order.orderItems.forEach((item: any) => {
      const itemName = item.name || item.product?.name || 'Item';
      const name = itemName.padEnd(16).substring(0, 16);
      const qty = item.quantity.toString().padStart(3);
      const price = (item.price || item.sellingPrice || 0).toFixed(0).padStart(6);
      const total = (item.total || 0).toFixed(0).padStart(7);
      builder.line(`${name}${qty}${price}${total}`);
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
