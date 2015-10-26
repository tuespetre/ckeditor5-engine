/**
 * @license Copyright (c) 2003-2015, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

/**
 * Basic creator class.
 *
 * @class Creator
 * @extends Plugin
 */

CKEDITOR.define( [ 'plugin' ], function( Plugin ) {
	class Creator extends Plugin {
		/**
		 * Gets data from a given source element.
		 *
		 * @param {HTMLElement} el The element from which the data will be retrieved.
		 * @returns {String} The data string.
		 */
		static getDataFromElement( el ) {
			if ( el instanceof HTMLTextAreaElement ) {
				return el.value;
			}

			return el.innerHTML;
		}

		/**
		 * Sets data in a given element.
		 *
		 * @param {HTMLElement} el The element in which the data will be set.
		 * @param {String} data The data string.
		 */
		static setDataInElement( el, data ) {
			if ( el instanceof HTMLTextAreaElement ) {
				el.value = data;
			}

			el.innerHTML = data;
		}
	}

	return Creator;
} );