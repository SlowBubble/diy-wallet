
export class MeloDoc extends HTMLElement {
  connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = 'helo';
    console.warn('hi');
  }
}

customElements.define('melo-doc', MeloDoc);
