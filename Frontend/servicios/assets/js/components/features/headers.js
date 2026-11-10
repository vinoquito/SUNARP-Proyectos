const PageHeader = {

    props: {

        title: {
            type: String,
            required: true
        },

        subtitle: {
            type: String,
            default: ''
        },

        description: {
            type: String,
            default: ''
        },

        titleColor: {
            type: String,
            default: 'var(--gob-text-primary)'
        },

        subtitleColor: {
            type: String,
            default: 'var(--gob-text-secondary)'
        },

        descriptionColor: {
            type: String,
            default: 'var(--gob-text-secondary)'
        },

        marginBottom: {
            type: String,
            default: '1.5rem'
        }

    },

    template: `

        <div
            :style="{
                marginBottom: marginBottom
            }">

            <h1
                :style="{
                    color: titleColor,
                    fontFamily: 'var(--gob-font-family)',
                    fontSize: 'var(--gob-h1-desktop-size)',
                    lineHeight: 'var(--gob-h1-desktop-line-height)',
                    fontWeight: 'var(--gob-h1-weight)',
                    margin: 0
                }">

                {{ title }}

            </h1>

            <h2
                v-if="subtitle"
                :style="{
                    color: subtitleColor,
                    fontFamily: 'var(--gob-font-family)',
                    fontSize: 'var(--gob-h4-desktop-size)',
                    lineHeight: 'var(--gob-h4-desktop-line-height)',
                    fontWeight: 'var(--gob-h4-weight)',
                    marginTop: '0.5rem',
                    marginBottom: 0
                }">

                {{ subtitle }}

            </h2>

            <p
                v-if="description"
                :style="{
                    color: descriptionColor,
                    fontFamily: 'var(--gob-font-family)',
                    fontSize: 'var(--gob-paragraph-size)',
                    lineHeight: 'var(--gob-paragraph-line-height)',
                    fontWeight: 'var(--gob-paragraph-weight)',
                    marginTop: '1rem',
                    marginBottom: 0
                }">

                {{ description }}

            </p>

        </div>

    `
};