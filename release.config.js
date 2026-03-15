/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
    branches: ['master'],
    tagFormat: 'service-v${version}',
    plugins: [
        ['@semantic-release/commit-analyzer', { config: 'conventional-changelog-cmyr-config' }],
        ['@semantic-release/release-notes-generator', { config: 'conventional-changelog-cmyr-config' }],
        '@semantic-release/github',
    ],
}
